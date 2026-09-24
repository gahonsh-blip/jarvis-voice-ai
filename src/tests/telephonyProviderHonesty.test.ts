import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  TwilioTelephonyProvider,
  TelnyxTelephonyProvider,
  PlivoTelephonyProvider,
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
});
