import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  TwilioTelephonyProvider,
  TelnyxTelephonyProvider,
  PlivoTelephonyProvider,
  SimulatedTestTelephonyProvider,
  TELEPHONY_WEBHOOK_BASE_URL_MISSING,
  TELEPHONY_WEBHOOK_RECEIVED_UNVERIFIED,
  TELEPHONY_DIAL_UNCONFIRMED_NO_SID,
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
  vi.unstubAllGlobals();
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

// Zero-fake-success guard for the provider webhook handlers.
//
// Every adapter's handleWebhook used to answer `success: true` without
// verifying a provider signature or performing any call action. Receiving an
// HTTP request is not evidence that a call was answered or a turn advanced, so
// the handler must report `success: false` and say only that it received the
// request.
describe('Telephony webhook handlers never report fake success', () => {
  function captureJson() {
    const captured: { body?: any } = {};
    const res = {
      json(body: any) {
        captured.body = body;
        return body;
      },
    };
    return { res, captured };
  }

  const cases: Array<[string, any]> = [
    ['twilio', TwilioTelephonyProvider],
    ['telnyx', TelnyxTelephonyProvider],
    ['plivo', PlivoTelephonyProvider],
  ];

  it.each(cases)('%s webhook reports received-but-unverified, never success', async (name, Ctor) => {
    const provider = new Ctor();
    const { res, captured } = captureJson();
    await provider.handleWebhook({ body: {} }, res);
    expect(captured.body.success).toBe(false);
    expect(captured.body.received).toBe(true);
    expect(captured.body.error).toContain(TELEPHONY_WEBHOOK_RECEIVED_UNVERIFIED);
  });

  it('simulated test provider webhook also reports received-but-unverified', async () => {
    const provider = new SimulatedTestTelephonyProvider();
    const { res, captured } = captureJson();
    await provider.handleWebhook({ body: {} }, res);
    expect(captured.body.success).toBe(false);
    expect(captured.body.received).toBe(true);
    expect(captured.body.simulationMarker).toBe('SIMULATION_ONLY');
  });
});

// Zero-fake-success guard for the successful Twilio dial branch.
//
// The adapter used to return `{ success: true, providerCallId: data.sid }`
// whenever the carrier answered 2xx. A response whose body carried no `sid`
// (or an empty one) therefore produced `success: true, providerCallId:
// undefined` — a dial reported as placed with no call id to prove it. Success
// must require the carrier to name the call it created.
describe('Twilio outbound dial success requires a carrier-issued call id', () => {
  function twilioWithReachableCallback() {
    process.env.TELEPHONY_WEBHOOK_BASE_URL = 'https://jarvis.example.test';
    return new TwilioTelephonyProvider();
  }

  it('reports a placed call with the carrier sid when the carrier names it', async () => {
    const provider = twilioWithReachableCallback();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sid: 'CA' + '1'.repeat(32) }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await provider.startOutboundCall({
      callSessionId: 'sess_ok',
      destinationNumber: '+15551119999',
    });

    expect(res.success).toBe(true);
    expect(res.providerCallId).toBe('CA' + '1'.repeat(32));
    // The carrier was actually called, so this is not a simulation.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses success when the carrier answers 2xx without a sid', async () => {
    const provider = twilioWithReachableCallback();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));

    const res = await provider.startOutboundCall({
      callSessionId: 'sess_no_sid',
      destinationNumber: '+15551119998',
    });

    expect(res.success).toBe(false);
    expect(res.providerCallId).toBeUndefined();
    expect(res.error).toContain(TELEPHONY_DIAL_UNCONFIRMED_NO_SID);
  });

  it('refuses success when the carrier sid is an empty string', async () => {
    const provider = twilioWithReachableCallback();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ sid: '   ' }) })));

    const res = await provider.startOutboundCall({
      callSessionId: 'sess_empty_sid',
      destinationNumber: '+15551119997',
    });

    expect(res.success).toBe(false);
    expect(res.providerCallId).toBeUndefined();
    expect(res.error).toContain(TELEPHONY_DIAL_UNCONFIRMED_NO_SID);
  });
});

