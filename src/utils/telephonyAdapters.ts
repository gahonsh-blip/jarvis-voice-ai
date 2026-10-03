import {
  TelephonyProvider,
  TelephonyCallState,
  TelephonyStatus,
} from '../types/telephonyProvider';
import { TELEPHONY_TWIML_TURN_PATH } from './telephonyEndpointTruth';
import { SIMULATION_PROVIDER_ID } from './telephonyGatewayTruth';

/**
 * Base abstract or utility functions for Telephony Adapters
 */

/**
 * Returned by the adapter methods that only build a provider document. None of
 * them issues a carrier API call, and the document is handed back to a caller
 * that discards it rather than returned to the provider in a live response, so
 * the action cannot be reported as done. `raw` still carries the document for a
 * live webhook response to use.
 */
export const TELEPHONY_DOCUMENT_NOT_DELIVERED =
  'TELEPHONY_DOCUMENT_NOT_DELIVERED: this adapter built the provider document but did not deliver it to the carrier in a live response, so the action is unconfirmed.';

/**
 * Returned by an outbound dial that cannot name a carrier-reachable callback
 * URL. The carrier is given this URL to reach back on for every call turn; a
 * fabricated or private host makes the provider accept a call it can never
 * complete, so the dial is refused rather than reported as placed.
 */
export const TELEPHONY_WEBHOOK_BASE_URL_MISSING =
  'TELEPHONY_WEBHOOK_BASE_URL_MISSING: no carrier-reachable webhook base URL is configured (set TELEPHONY_WEBHOOK_BASE_URL to a public https URL), so the call-answer callback cannot be given to the provider.';

/**
 * Whether a webhook base URL is one a PSTN carrier could actually reach back
 * on: an absolute `https` URL whose host is not loopback, a `.local` name, or a
 * private (RFC 1918) address. `http`, `localhost`, `127.0.0.1`, `0.0.0.0`,
 * `10/8`, `192.168/16` and `172.16/12` are all unreachable from the public
 * internet and must not be handed to a carrier as a callback.
 */
export function isCarrierReachableWebhookBaseUrl(raw: string | undefined | null): boolean {
  const value = (raw || '').trim();
  if (!value) return false;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') return false;
  if (host.endsWith('.local')) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)) return false;
  return true;
}

/**
 * 1. Twilio Telephony Provider Adapter
 */
export class TwilioTelephonyProvider implements TelephonyProvider {
  id = 'twilio';
  name = 'Twilio Voice Gateway';
  private accountSid: string;
  private authToken: string;
  private phoneNumber: string;
  private webhookBaseUrl: string;

  constructor(config?: {
    accountSid?: string;
    authToken?: string;
    phoneNumber?: string;
    webhookBaseUrl?: string;
  }) {
    this.accountSid = config?.accountSid || process.env.TWILIO_ACCOUNT_SID || process.env.TELEPHONY_ACCOUNT_ID || '';
    this.authToken = config?.authToken || process.env.TWILIO_AUTH_TOKEN || process.env.TELEPHONY_AUTH_SECRET || '';
    this.phoneNumber = config?.phoneNumber || process.env.TWILIO_PHONE_NUMBER || process.env.TELEPHONY_PHONE_NUMBER || '';
    this.webhookBaseUrl = config?.webhookBaseUrl || process.env.TELEPHONY_WEBHOOK_BASE_URL || '';
  }

  isConfigured(): boolean {
    return Boolean(
      this.accountSid &&
      this.accountSid.startsWith('AC') &&
      this.accountSid.length >= 20 &&
      this.authToken &&
      this.authToken.length >= 16 &&
      this.phoneNumber
    );
  }

  async answerIncomingCall(params: { callSessionId: string; greeting?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'TELEPHONY_NOT_CONFIGURED: Twilio credentials missing' };
    }
    return {
      success: false,
      error: TELEPHONY_DOCUMENT_NOT_DELIVERED,
      raw: {
        action: 'TwiML_ANSWER',
        callSessionId: params.callSessionId,
        twiml: `<Response><Say voice="Polly.Aditi" language="hi-IN">${params.greeting || 'नमस्ते, मैं जार्विस हूँ।'}</Say><Gather input="speech" language="hi-IN" action="/api/telephony/twiml/turn" speechTimeout="auto"/></Response>`,
      },
    };
  }

  async rejectIncomingCall(params: { callSessionId: string; reason?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    }
    return {
      success: false,
      error: TELEPHONY_DOCUMENT_NOT_DELIVERED,
      raw: {
        action: 'TwiML_REJECT',
        reason: params.reason || 'busy',
        twiml: `<Response><Reject reason="${params.reason || 'busy'}"/></Response>`,
      },
    };
  }

  async endCall(params: { callSessionId: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    }
    return {
      success: false,
      error: TELEPHONY_DOCUMENT_NOT_DELIVERED,
      raw: {
        action: 'TwiML_HANGUP',
        callSessionId: params.callSessionId,
        twiml: `<Response><Hangup/></Response>`,
      },
    };
  }

  async startOutboundCall(params: {
    callSessionId: string;
    destinationNumber: string;
    fromNumber?: string;
    initialGreeting?: string;
  }): Promise<{ success: boolean; providerCallId?: string; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'TELEPHONY_NOT_CONFIGURED: Cannot place outbound PSTN call without valid credentials.' };
    }

    // The carrier is handed this URL and calls back on it for every turn. A
    // fabricated default or a private host cannot be reached, so the call would
    // be accepted by the provider but never complete — refuse instead of
    // reporting a placed call that could never connect.
    if (!isCarrierReachableWebhookBaseUrl(this.webhookBaseUrl)) {
      return { success: false, error: TELEPHONY_WEBHOOK_BASE_URL_MISSING };
    }

    try {
      const from = params.fromNumber || this.phoneNumber;
      const callbackUrl = `${this.webhookBaseUrl}${TELEPHONY_TWIML_TURN_PATH}`;
      
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
      const body = new URLSearchParams({
        To: params.destinationNumber,
        From: from,
        Url: callbackUrl,
      });

      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Calls.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errText = await response.text();
        return { success: false, error: `Twilio API Call Failed (${response.status}): ${errText}` };
      }

      const data = await response.json();
      return { success: true, providerCallId: data.sid };
    } catch (err: any) {
      return { success: false, error: `Twilio Network Error: ${err.message}` };
    }
  }

  async playAudio(params: { callSessionId: string; audioUrlOrText: string; language?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    const isHindi = params.language?.startsWith('hi');
    const voice = isHindi ? 'Polly.Aditi' : 'Polly.Matthew';
    const lang = isHindi ? 'hi-IN' : 'en-IN';
    return {
      success: false,
      error: TELEPHONY_DOCUMENT_NOT_DELIVERED,
      raw: {
        twiml: `<Response><Say voice="${voice}" language="${lang}">${params.audioUrlOrText}</Say></Response>`,
      },
    };
  }

  async streamAudio(params: { callSessionId: string; streamUrl: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    return {
      success: false,
      error: TELEPHONY_DOCUMENT_NOT_DELIVERED,
      raw: {
        twiml: `<Response><Connect><Stream url="${params.streamUrl}" /></Connect></Response>`,
      },
    };
  }

  async collectSpeech(params: { callSessionId: string; promptText?: string; timeoutMs?: number; language?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    const lang = params.language || 'hi-IN';
    const timeoutSec = Math.round((params.timeoutMs || 5000) / 1000);
    return {
      success: false,
      error: TELEPHONY_DOCUMENT_NOT_DELIVERED,
      raw: {
        twiml: `<Response>${params.promptText ? `<Say language="${lang}">${params.promptText}</Say>` : ''}<Gather input="speech" language="${lang}" timeout="${timeoutSec}" action="/api/telephony/twiml/turn"/></Response>`,
      },
    };
  }

  async transferCall(params: { callSessionId: string; targetNumber: string }): Promise<{ success: boolean; providerConfirmed: boolean; message?: string; raw?: any; error?: string }> {
    if (!this.isConfigured()) {
      return {
        success: false,
        providerConfirmed: false,
        error: 'TELEPHONY_NOT_CONFIGURED: Cannot execute PSTN call transfer without active provider.',
      };
    }
    // A TwiML <Dial> document is an instruction, not a confirmation. It only
    // reaches the carrier when it is returned to Twilio inside a live webhook
    // response; this method returns it to a caller that discards it. Reporting
    // providerConfirmed:true here made the receptionist announce a handoff
    // that never occurred. Return the TwiML for a live response to use, and
    // keep the confirmation false.
    return {
      success: false,
      providerConfirmed: false,
      error: 'TELEPHONY_TRANSFER_UNCONFIRMED: the transfer TwiML has not been delivered to Twilio in a live webhook response, so the handoff cannot be confirmed.',
      raw: {
        twiml: `<Response><Dial>${params.targetNumber}</Dial></Response>`,
      },
    };
  }

  async getCallStatus(callSessionId: string): Promise<{ state: TelephonyCallState; raw?: any }> {
    // This adapter does not query the Twilio Calls resource here, so it cannot
    // observe the live state of the call.
    return { state: 'UNKNOWN' };
  }

  async getCallRecordingStatus(callSessionId: string): Promise<{ recording: boolean; recordingUrl?: string }> {
    return { recording: false };
  }

  async handleWebhook(req: any, res: any): Promise<any> {
    return res.json({ success: true, provider: 'twilio' });
  }
}

/**
 * 2. Telnyx Telephony Provider Adapter
 */
export class TelnyxTelephonyProvider implements TelephonyProvider {
  id = 'telnyx';
  name = 'Telnyx Voice Gateway';
  private apiKey: string;
  private connectionId: string;
  private phoneNumber: string;

  constructor(config?: { apiKey?: string; connectionId?: string; phoneNumber?: string }) {
    this.apiKey = config?.apiKey || process.env.TELNYX_API_KEY || process.env.TELEPHONY_AUTH_SECRET || '';
    this.connectionId = config?.connectionId || process.env.TELNYX_CONNECTION_ID || process.env.TELEPHONY_ACCOUNT_ID || '';
    this.phoneNumber = config?.phoneNumber || process.env.TELNYX_PHONE_NUMBER || process.env.TELEPHONY_PHONE_NUMBER || '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length >= 16 && this.phoneNumber);
  }

  async answerIncomingCall(params: { callSessionId: string; greeting?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    if (!this.isConfigured()) return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { command: 'answer', callSessionId: params.callSessionId } };
  }

  async rejectIncomingCall(params: { callSessionId: string; reason?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    if (!this.isConfigured()) return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { command: 'reject', callSessionId: params.callSessionId } };
  }

  async endCall(params: { callSessionId: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    if (!this.isConfigured()) return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { command: 'hangup', callSessionId: params.callSessionId } };
  }

  async startOutboundCall(params: {
    callSessionId: string;
    destinationNumber: string;
    fromNumber?: string;
    initialGreeting?: string;
  }): Promise<{ success: boolean; providerCallId?: string; error?: string }> {
    if (!this.isConfigured()) return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    // No Telnyx Call Control API call is made from this process yet. A
    // `telnyx_<timestamp>` string is not a carrier call id, and the outbound
    // route would surface it as a placed call. Report the gap instead of
    // inventing an identifier until the real Call Control call exists.
    return { success: false, error: 'TELEPHONY_PROVIDER_DISPATCH_NOT_IMPLEMENTED: the Telnyx Call Control API is not invoked by this adapter, so this process cannot confirm an outbound call was placed.' };
  }

  async playAudio(params: { callSessionId: string; audioUrlOrText: string; language?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { command: 'speak', text: params.audioUrlOrText } };
  }

  async streamAudio(params: { callSessionId: string; streamUrl: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { command: 'streaming_start', url: params.streamUrl } };
  }

  async collectSpeech(params: { callSessionId: string; promptText?: string; timeoutMs?: number; language?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { command: 'gather_using_speak', language: params.language || 'hi-IN' } };
  }

  async transferCall(params: { callSessionId: string; targetNumber: string }): Promise<{ success: boolean; providerConfirmed: boolean; message?: string; raw?: any; error?: string }> {
    if (!this.isConfigured()) return { success: false, providerConfirmed: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    // Nothing in this process issues a Telnyx Call Control `transfer` command,
    // so no confirmation can be observed. `providerConfirmed` must stay false
    // or the receptionist announces a live transfer that never happened.
    return { success: false, providerConfirmed: false, error: 'TELEPHONY_PROVIDER_DISPATCH_NOT_IMPLEMENTED: the Telnyx Call Control transfer command is not invoked by this adapter, so the transfer is unconfirmed.' };
  }

  async getCallStatus(callSessionId: string): Promise<{ state: TelephonyCallState; raw?: any }> {
    // This adapter holds no Telnyx control-channel state, so it cannot report
    // the live state of a call. UNKNOWN is the honest answer until the Call
    // Control API is actually queried.
    return { state: 'UNKNOWN' };
  }

  async getCallRecordingStatus(callSessionId: string): Promise<{ recording: boolean; recordingUrl?: string }> {
    return { recording: false };
  }

  async handleWebhook(req: any, res: any): Promise<any> {
    return res.json({ success: true, provider: 'telnyx' });
  }
}

/**
 * 3. Plivo Telephony Provider Adapter
 */
export class PlivoTelephonyProvider implements TelephonyProvider {
  id = 'plivo';
  name = 'Plivo Voice Gateway';
  private authId: string;
  private authToken: string;
  private phoneNumber: string;

  constructor(config?: { authId?: string; authToken?: string; phoneNumber?: string }) {
    this.authId = config?.authId || process.env.PLIVO_AUTH_ID || process.env.TELEPHONY_ACCOUNT_ID || '';
    this.authToken = config?.authToken || process.env.PLIVO_AUTH_TOKEN || process.env.TELEPHONY_AUTH_SECRET || '';
    this.phoneNumber = config?.phoneNumber || process.env.PLIVO_PHONE_NUMBER || process.env.TELEPHONY_PHONE_NUMBER || '';
  }

  isConfigured(): boolean {
    return Boolean(this.authId && this.authToken && this.phoneNumber);
  }

  async answerIncomingCall(params: { callSessionId: string; greeting?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    if (!this.isConfigured()) return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { plivoXml: `<Response><Speak>${params.greeting || 'Hello'}</Speak></Response>` } };
  }

  async rejectIncomingCall(params: { callSessionId: string; reason?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    if (!this.isConfigured()) return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { plivoXml: `<Response><Hangup reason="busy"/></Response>` } };
  }

  async endCall(params: { callSessionId: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    if (!this.isConfigured()) return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { plivoXml: `<Response><Hangup/></Response>` } };
  }

  async startOutboundCall(params: {
    callSessionId: string;
    destinationNumber: string;
    fromNumber?: string;
    initialGreeting?: string;
  }): Promise<{ success: boolean; providerCallId?: string; error?: string }> {
    if (!this.isConfigured()) return { success: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    // See the Telnyx adapter: no Plivo REST call is made here, so a
    // `plivo_<timestamp>` string must not be presented as a placed call.
    return { success: false, error: 'TELEPHONY_PROVIDER_DISPATCH_NOT_IMPLEMENTED: the Plivo REST API is not invoked by this adapter, so this process cannot confirm an outbound call was placed.' };
  }

  async playAudio(params: { callSessionId: string; audioUrlOrText: string; language?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { plivoXml: `<Response><Speak>${params.audioUrlOrText}</Speak></Response>` } };
  }

  async streamAudio(params: { callSessionId: string; streamUrl: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { plivoXml: `<Response><Stream>${params.streamUrl}</Stream></Response>` } };
  }

  async collectSpeech(params: { callSessionId: string; promptText?: string; timeoutMs?: number; language?: string }): Promise<{ success: boolean; raw?: any; error?: string }> {
    return { success: false, error: TELEPHONY_DOCUMENT_NOT_DELIVERED, raw: { plivoXml: `<Response><GetDigits action="/api/telephony/plivo/digits"/></Response>` } };
  }

  async transferCall(params: { callSessionId: string; targetNumber: string }): Promise<{ success: boolean; providerConfirmed: boolean; message?: string; raw?: any; error?: string }> {
    if (!this.isConfigured()) return { success: false, providerConfirmed: false, error: 'TELEPHONY_NOT_CONFIGURED' };
    // No Plivo transfer command is issued from this process, so the transfer
    // is unconfirmed. Never report a confirmed handoff that nothing observed.
    return { success: false, providerConfirmed: false, error: 'TELEPHONY_PROVIDER_DISPATCH_NOT_IMPLEMENTED: the Plivo transfer command is not invoked by this adapter, so the transfer is unconfirmed.' };
  }

  async getCallStatus(callSessionId: string): Promise<{ state: TelephonyCallState; raw?: any }> {
    // No Plivo control-channel state is held here; the live state is unknown.
    return { state: 'UNKNOWN' };
  }

  async getCallRecordingStatus(callSessionId: string): Promise<{ recording: boolean; recordingUrl?: string }> {
    return { recording: false };
  }

  async handleWebhook(req: any, res: any): Promise<any> {
    return res.json({ success: true, provider: 'plivo' });
  }
}

/**
 * 4. Fake-Provider Test Adapter (SIMULATION_ONLY)
 * Used strictly for automated tests and local verification.
 * Section V: Marked with SIMULATION_ONLY. Never reports fake real call in production.
 */
export class SimulatedTestTelephonyProvider implements TelephonyProvider {
  id = 'simulation_test_provider';
  name = 'Simulated Test Provider (SIMULATION_ONLY)';
  public lastEvent: string = '';
  public state: TelephonyCallState = 'IDLE';
  public callTransferred: boolean = false;
  public transferTarget: string = '';
  public speechHistory: string[] = [];

  isConfigured(): boolean {
    return true; // Test adapter is always ready for tests
  }

  async answerIncomingCall(params: { callSessionId: string; greeting?: string }): Promise<{ success: boolean; raw?: any }> {
    this.lastEvent = 'SIMULATION_ONLY:ANSWERED';
    this.state = 'LISTENING';
    return {
      success: true,
      raw: { simulationMarker: 'SIMULATION_ONLY', state: 'ANSWERED', greeting: params.greeting },
    };
  }

  async rejectIncomingCall(params: { callSessionId: string; reason?: string }): Promise<{ success: boolean; raw?: any }> {
    this.lastEvent = 'SIMULATION_ONLY:REJECTED';
    this.state = 'ENDED';
    return {
      success: true,
      raw: { simulationMarker: 'SIMULATION_ONLY', state: 'REJECTED', reason: params.reason },
    };
  }

  async endCall(params: { callSessionId: string }): Promise<{ success: boolean; raw?: any }> {
    this.lastEvent = 'SIMULATION_ONLY:ENDED';
    this.state = 'ENDED';
    return {
      success: true,
      raw: { simulationMarker: 'SIMULATION_ONLY', state: 'ENDED' },
    };
  }

  async startOutboundCall(params: {
    callSessionId: string;
    destinationNumber: string;
    fromNumber?: string;
    initialGreeting?: string;
  }): Promise<{ success: boolean; providerCallId?: string }> {
    this.lastEvent = `SIMULATION_ONLY:OUTBOUND_DIALED:${params.destinationNumber}`;
    this.state = 'RINGING';
    return {
      success: true,
      providerCallId: `sim_call_${Date.now()}`,
    };
  }

  async playAudio(params: { callSessionId: string; audioUrlOrText: string; language?: string }): Promise<{ success: boolean; raw?: any }> {
    this.lastEvent = `SIMULATION_ONLY:SPOKEN:${params.audioUrlOrText}`;
    this.speechHistory.push(params.audioUrlOrText);
    this.state = 'SPEAKING';
    return {
      success: true,
      raw: { simulationMarker: 'SIMULATION_ONLY', spoken: params.audioUrlOrText },
    };
  }

  async streamAudio(params: { callSessionId: string; streamUrl: string }): Promise<{ success: boolean; raw?: any }> {
    this.lastEvent = `SIMULATION_ONLY:STREAMING:${params.streamUrl}`;
    return {
      success: true,
      raw: { simulationMarker: 'SIMULATION_ONLY', streamUrl: params.streamUrl },
    };
  }

  async collectSpeech(params: { callSessionId: string; promptText?: string; timeoutMs?: number; language?: string }): Promise<{ success: boolean; raw?: any }> {
    this.lastEvent = 'SIMULATION_ONLY:COLLECTING_SPEECH';
    this.state = 'LISTENING';
    return {
      success: true,
      raw: { simulationMarker: 'SIMULATION_ONLY', status: 'LISTENING' },
    };
  }

  async transferCall(params: { callSessionId: string; targetNumber: string }): Promise<{ success: boolean; providerConfirmed: boolean; message?: string; raw?: any; error?: string }> {
    this.lastEvent = `SIMULATION_ONLY:TRANSFERRED:${params.targetNumber}`;
    this.callTransferred = true;
    this.transferTarget = params.targetNumber;
    this.state = 'TRANSFERRING';
    return {
      success: true,
      providerConfirmed: true,
      message: `SIMULATION_ONLY: Call transferred to staff line ${params.targetNumber}`,
    };
  }

  async getCallStatus(callSessionId: string): Promise<{ state: TelephonyCallState; raw?: any }> {
    return { state: this.state, raw: { simulationMarker: 'SIMULATION_ONLY' } };
  }

  async getCallRecordingStatus(callSessionId: string): Promise<{ recording: boolean; recordingUrl?: string }> {
    return { recording: false };
  }

  async handleWebhook(req: any, res: any): Promise<any> {
    return res.json({ success: true, simulationMarker: 'SIMULATION_ONLY' });
  }
}

/**
 * Telephony Provider Registry & Factory
 */
export class TelephonyProviderRegistry {
  private static providers: Map<string, TelephonyProvider> = new Map();
  private static activeProviderId: string = 'twilio';

  static initialize(): void {
    const twilio = new TwilioTelephonyProvider();
    const telnyx = new TelnyxTelephonyProvider();
    const plivo = new PlivoTelephonyProvider();
    const simulation = new SimulatedTestTelephonyProvider();

    this.registerProvider(twilio);
    this.registerProvider(telnyx);
    this.registerProvider(plivo);
    this.registerProvider(simulation);

    const configuredType = (process.env.TELEPHONY_PROVIDER || 'twilio').toLowerCase();
    if (this.providers.has(configuredType)) {
      this.activeProviderId = configuredType;
    }
  }

  static registerProvider(provider: TelephonyProvider): void {
    this.providers.set(provider.id, provider);
  }

  static getProvider(id?: string): TelephonyProvider {
    if (this.providers.size === 0) {
      this.initialize();
    }
    const targetId = id || this.activeProviderId;
    const prov = this.providers.get(targetId);
    if (!prov) {
      return this.providers.get('twilio') || new TwilioTelephonyProvider();
    }
    return prov;
  }

  static setActiveProvider(id: string): boolean {
    if (this.providers.size === 0) {
      this.initialize();
    }
    if (this.providers.has(id)) {
      this.activeProviderId = id;
      return true;
    }
    return false;
  }

  static getActiveStatus(): TelephonyStatus {
    const active = this.getProvider();
    // A simulation adapter has no PSTN carrier, so it is never a usable
    // telephony status no matter what its isConfigured() claims ("always ready
    // for tests"). Reporting READY here is what let the offline engine dial
    // through the simulator believing a carrier was configured.
    if (active.id === SIMULATION_PROVIDER_ID) {
      return 'NOT_CONFIGURED';
    }
    if (!active.isConfigured()) {
      return 'NOT_CONFIGURED';
    }
    return 'READY';
  }

  static getAllProviders(): Array<{ id: string; name: string; isConfigured: boolean }> {
    if (this.providers.size === 0) {
      this.initialize();
    }
    return Array.from(this.providers.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isConfigured: p.isConfigured(),
    }));
  }
}
