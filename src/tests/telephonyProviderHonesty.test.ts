import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TwilioTelephonyProvider,
  TelnyxTelephonyProvider,
  PlivoTelephonyProvider,
  TELEPHONY_WEBHOOK_BASE_URL_MISSING,
} from '../utils/telephonyAdapters';

// Zero-fake-success guard for the telephony providers.
//
// The Telnyx and Plivo adapters made no carrier API call yet still returned
// `startOutboundCall: { success: true, providerCallId: 'telnyx_<ts>' }` and
// `transferCall: { providerConfirmed: true }`. The receptionist session
// manager announces "Transferring your call to our clinic staff now" when
// `providerConfirmed` is true, so a caller heard a live handoff that never
// happened. These tests pin the honest behaviour: a provider that did not
// observe an action must not report it as confirmed.

const ENV_KEYS = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'TELNYX_API_KEY',
  'TELNYX_CONNECTION_ID',
  'TELNYX_PHONE_NUMBER',
  'PLIVO_AUTH_ID',
  'PLIVO_AUTH_TOKEN',
  'PLIVO_PHONE_NUMBER',
  'TELEPHONY_AUTH_SECRET',
  'TELEPHONY_ACCOUNT_ID',
  'TELEPHONY_PHONE_NUMBER',
  'TELEPHONY_WEBHOOK_BASE_URL',
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  // Force each adapter into its "configured" branch so the guard cannot pass
  // merely because credentials are absent.
  process.env.TELNYX_API_KEY = 'telnyx_key_0123456789abcdef';
  process.env.TELNYX_CONNECTION_ID = 'conn_123456';
  process.env.TELNYX_PHONE_NUMBER = '+15550000001';
  process.env.PLIVO_AUTH_ID = 'plivo_auth_id';
  process.env.PLIVO_AUTH_TOKEN = 'plivo_auth_token';
  process.env.PLIVO_PHONE_NUMBER = '+15550000002';
  process.env.TWILIO_ACCOUNT_SID = 'AC00000000000000000000000000000000';
  process.env.TWILIO_AUTH_TOKEN = 'twilio_auth_token';
  process.env.TWILIO_PHONE_NUMBER = '+15550000003';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('telephony providers never fabricate confirmed provider actions', () => {
  it('Telnyx does not invent a provider call id for an outbound call it never placed', async () => {
    const provider = new TelnyxTelephonyProvider();
    expect(provider.isConfigured()).toBe(true);

    const res = await provider.startOutboundCall({
      callSessionId: 'sess_telnyx_1',
      destinationNumber: '+15551112222',
    });

    expect(res.success).toBe(false);
    expect(res.providerCallId).toBeUndefined();
    expect(res.error).toContain('TELEPHONY_PROVIDER_DISPATCH_NOT_IMPLEMENTED');
  });

  it('Telnyx does not confirm a transfer it never issued', async () => {
    const provider = new TelnyxTelephonyProvider();
    expect(provider.isConfigured()).toBe(true);

    const res = await provider.transferCall({
      callSessionId: 'sess_telnyx_2',
      targetNumber: '+15551113333',
    });

    expect(res.providerConfirmed).toBe(false);
    expect(res.success).toBe(false);
  });

  it('Plivo does not invent a provider call id for an outbound call it never placed', async () => {
    const provider = new PlivoTelephonyProvider();
    expect(provider.isConfigured()).toBe(true);

    const res = await provider.startOutboundCall({
      callSessionId: 'sess_plivo_1',
      destinationNumber: '+15551114444',
    });

    expect(res.success).toBe(false);
    expect(res.providerCallId).toBeUndefined();
    expect(res.error).toContain('TELEPHONY_PROVIDER_DISPATCH_NOT_IMPLEMENTED');
  });

  it('Plivo does not confirm a transfer it never issued', async () => {
    const provider = new PlivoTelephonyProvider();
    expect(provider.isConfigured()).toBe(true);

    const res = await provider.transferCall({
      callSessionId: 'sess_plivo_2',
      targetNumber: '+15551115555',
    });

    expect(res.providerConfirmed).toBe(false);
    expect(res.success).toBe(false);
  });

  it('Twilio does not confirm a transfer whose TwiML was never delivered to the carrier', async () => {
    const provider = new TwilioTelephonyProvider();
    expect(provider.isConfigured()).toBe(true);

    const res = await provider.transferCall({
      callSessionId: 'sess_twilio_1',
      targetNumber: '+15551116666',
    });

    expect(res.providerConfirmed).toBe(false);
    expect(res.success).toBe(false);
    // The TwiML is still produced for a genuine live webhook response to use.
    expect(res.raw?.twiml).toContain('<Dial>');
  });

  it('adapters report an unknown call state rather than asserting IDLE', async () => {
    for (const provider of [
      new TwilioTelephonyProvider(),
      new TelnyxTelephonyProvider(),
      new PlivoTelephonyProvider(),
    ]) {
      const status = await provider.getCallStatus('sess_unknown');
      expect(status.state).toBe('UNKNOWN');
    }
  });

  // The remaining document-only methods (answer/reject/end, play/stream audio,
  // collect speech) build a provider document but never deliver it to the
  // carrier — there is no live webhook response consuming the return value.
  // Reporting `success: true` there is the same fake success that `transferCall`
  // already dropped. This sweeps every such method on every real provider.
  const DOCUMENT_ONLY_CALLS: [string, (p: any) => Promise<{ success: boolean; error?: string; raw?: any }>][] = [
    ['answerIncomingCall', (p) => p.answerIncomingCall({ callSessionId: 'sess_doc' })],
    ['rejectIncomingCall', (p) => p.rejectIncomingCall({ callSessionId: 'sess_doc' })],
    ['endCall', (p) => p.endCall({ callSessionId: 'sess_doc' })],
    ['playAudio', (p) => p.playAudio({ callSessionId: 'sess_doc', audioUrlOrText: 'hello' })],
    ['streamAudio', (p) => p.streamAudio({ callSessionId: 'sess_doc', streamUrl: 'wss://example.test' })],
    ['collectSpeech', (p) => p.collectSpeech({ callSessionId: 'sess_doc', promptText: 'say' })],
  ];

  it('no real provider reports an undelivered document as a successful action', async () => {
    const providers = [
      new TwilioTelephonyProvider(),
      new TelnyxTelephonyProvider(),
      new PlivoTelephonyProvider(),
    ];
    for (const provider of providers) {
      expect(provider.isConfigured()).toBe(true);
      for (const [name, call] of DOCUMENT_ONLY_CALLS) {
        const res = await call(provider);
        expect(res.success, `${provider.id}.${name} claimed success`).toBe(false);
        expect(res.error, `${provider.id}.${name} gave no reason`).toContain(
          'TELEPHONY_DOCUMENT_NOT_DELIVERED',
        );
      }
    }
  });

  it('the undelivered document is still returned for a live response to use', async () => {
    const twilio = new TwilioTelephonyProvider();
    const answer = await twilio.answerIncomingCall({ callSessionId: 'sess_doc' });
    expect(answer.raw?.twiml).toContain('<Response>');
    expect(answer.raw?.twiml).toContain('Gather');

    const plivo = new PlivoTelephonyProvider();
    const stream = await plivo.streamAudio({ callSessionId: 'sess_doc', streamUrl: 'wss://x' });
    expect(stream.raw?.plivoXml).toContain('<Stream>');
  });

  // The carrier is given the callback URL and calls back on it for every turn.
  // A fabricated or private host means the call is accepted but can never
  // connect, so the dial must be refused rather than reported as placed.
  it('Twilio refuses an outbound dial when no carrier-reachable callback URL is configured', async () => {
    const provider = new TwilioTelephonyProvider();
    expect(provider.isConfigured()).toBe(true);
    // No TELEPHONY_WEBHOOK_BASE_URL is set, so the adapter must not fall back
    // to a fabricated host.
    const res = await provider.startOutboundCall({
      callSessionId: 'sess_no_callback',
      destinationNumber: '+15551117777',
    });
    expect(res.success).toBe(false);
    expect(res.providerCallId).toBeUndefined();
    expect(res.error).toContain(TELEPHONY_WEBHOOK_BASE_URL_MISSING);
  });

  it('Twilio still refuses a dial when the configured callback host is private', async () => {
    process.env.TELEPHONY_WEBHOOK_BASE_URL = 'https://192.168.0.5';
    const provider = new TwilioTelephonyProvider();
    expect(provider.isConfigured()).toBe(true);
    const res = await provider.startOutboundCall({
      callSessionId: 'sess_private_callback',
      destinationNumber: '+15551118888',
    });
    expect(res.success).toBe(false);
    expect(res.error).toContain(TELEPHONY_WEBHOOK_BASE_URL_MISSING);
  });
});
