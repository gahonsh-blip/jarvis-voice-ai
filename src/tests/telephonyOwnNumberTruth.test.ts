// HERMES JARVIS — telephony own-number honesty.
//
// `App.tsx` stamped every call record's own side of the line with
// `telephonySettings.twilioPhoneNumber || '+1 (555) 728-4827'`. The settings
// field was empty until a carrier number was configured, and both the client
// default and the server state seeded the literal '+1 (555) 728-4827'. So the
// call history and the CSV export presented an invented number as the origin of
// an outbound call and the arrival line of an inbound call.
//
// These tests pin the replacement: the own number is the recorded configured
// value or empty, never a placeholder. They also read App.tsx, telephony.ts and
// server.ts to prove the fabricated placeholder is gone from all three.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  recordedOwnNumber,
  hasRecordedOwnNumber,
  resolveRawNumber,
  OWN_NUMBER_NOT_RECORDED,
} from '../utils/hardening/telephonyOwnNumberTruth';
import { TelephonySessionManager } from '../utils/telephonySessionManager';
import { maskPhoneNumber } from '../utils/telephonyPermissions';
import { DEFAULT_TELEPHONY_SETTINGS } from '../types/telephony';

const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
const telephonySource = fs.readFileSync(path.resolve(process.cwd(), 'src/types/telephony.ts'), 'utf8');
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

describe('recordedOwnNumber reports only a recorded number', () => {
  it('returns a configured number, trimmed', () => {
    expect(recordedOwnNumber('  +1 (415) 555-0100  ')).toBe('+1 (415) 555-0100');
  });

  it('returns null for an empty or whitespace-only setting', () => {
    expect(recordedOwnNumber('')).toBeNull();
    expect(recordedOwnNumber('   ')).toBeNull();
  });

  it('returns null when the setting is absent', () => {
    expect(recordedOwnNumber(undefined)).toBeNull();
    expect(recordedOwnNumber(null)).toBeNull();
  });

  it('hasRecordedOwnNumber mirrors the same rule', () => {
    expect(hasRecordedOwnNumber('+1 (415) 555-0100')).toBe(true);
    expect(hasRecordedOwnNumber('')).toBe(false);
    expect(hasRecordedOwnNumber(undefined)).toBe(false);
  });

  it('names the missing value instead of inventing one', () => {
    expect(OWN_NUMBER_NOT_RECORDED).toBe('not recorded');
  });
});

describe('App.tsx records the own number from settings, never a placeholder', () => {
  it('no longer falls back to the fabricated +1 (555) 728-4827', () => {
    expect(appSource).not.toContain("'+1 (555) 728-4827'");
  });

  it('derives both the outbound origin and inbound arrival line from settings', () => {
    expect(appSource).toContain('recordedOwnNumber(telephonySettings.twilioPhoneNumber)');
  });

  it('refuses an outbound call that has no dialled number', () => {
    // The dialled number is optional and the starter returns early when it is
    // missing, so no call record is created for a call that was never placed.
    expect(appSource).toMatch(/recipientNumber\?: string/);
    expect(appSource).toMatch(/if \(!recipientNumber \|\| !recipientNumber\.trim\(\)\)/);
    expect(appSource).toContain('recipientNumber,');
  });
});

describe('default settings do not seed a placeholder carrier number', () => {
  it('DEFAULT_TELEPHONY_SETTINGS.twilioPhoneNumber is empty', () => {
    expect(DEFAULT_TELEPHONY_SETTINGS.twilioPhoneNumber).toBe('');
  });

  it('telephony.ts no longer carries the simulated-number literal', () => {
    expect(telephonySource).not.toContain('JARVIS simulated carrier number');
  });
});

describe('server telephony settings do not seed a placeholder carrier number', () => {
  it('server.ts no longer defaults the carrier number to a literal', () => {
    expect(serverSource).not.toContain("process.env.TWILIO_PHONE_NUMBER || '+1 (555) 728-4827'");
  });
});

describe('resolveRawNumber records only a supplied party number', () => {
  it('trims a supplied number and leaves it usable', () => {
    expect(resolveRawNumber('  +91 98765 00000  ')).toBe('+91 98765 00000');
  });

  it('returns an empty string for an absent, null or blank number', () => {
    expect(resolveRawNumber(undefined)).toBe('');
    expect(resolveRawNumber(null)).toBe('');
    expect(resolveRawNumber('   ')).toBe('');
  });

  it('an empty raw number is displayed as Unknown / Private, not a fabricated one', () => {
    expect(maskPhoneNumber(resolveRawNumber(undefined))).toBe('Unknown / Private');
  });
});

describe('an inbound call session never invents its caller or arrival line', () => {
  it('records an empty caller when the carrier payload carried no number', () => {
    const session = TelephonySessionManager.createInboundSession({
      rawCallerNumber: '',
      providerName: 'hermes-test',
      isSimulated: true,
    });
    expect(session.callerRawNumber).toBe('');
    expect(session.callerIdentifier).toBe('Unknown / Private');
    // The sample clinic line must never be stamped as the line the call arrived on.
    expect(session.recipientRawNumber).toBe('');
    expect(session.recipientIdentifier).toBe('Unknown / Private');
  });

  it('records a real caller and arrival line unchanged when both are supplied', () => {
    const session = TelephonySessionManager.createInboundSession({
      rawCallerNumber: '+91 98765 11111',
      rawRecipientNumber: '+91 98765 22222',
      providerName: 'hermes-test',
      isSimulated: true,
    });
    expect(session.callerRawNumber).toBe('+91 98765 11111');
    expect(session.recipientRawNumber).toBe('+91 98765 22222');
  });
});

describe('an outbound call session never claims the sample clinic line as its own', () => {
  it('records an empty own number when no carrier number is configured', () => {
    expect(DEFAULT_TELEPHONY_SETTINGS.twilioPhoneNumber).toBe('');
    const res = TelephonySessionManager.createOutboundSession({
      destinationNumber: '+91 98765 33333',
      purpose: 'own-number honesty test',
      ownNumber: resolveRawNumber(DEFAULT_TELEPHONY_SETTINGS.twilioPhoneNumber),
    });
    expect(res.session?.callerRawNumber).toBe('');
  });

  it('records a configured own number unchanged', () => {
    const res = TelephonySessionManager.createOutboundSession({
      destinationNumber: '+91 98765 33333',
      purpose: 'own-number honesty test',
      ownNumber: resolveRawNumber('+91 98765 99999'),
    });
    expect(res.session?.callerRawNumber).toBe('+91 98765 99999');
  });
});

describe('server telephony routes no longer fabricate a party number', () => {
  it('the inbound route does not fall back to the literal +91 9876543210', () => {
    expect(serverSource).not.toContain("req.body.From || req.body.callerNumber || '+91 9876543210'");
  });

  it('the inbound route derives both raw numbers through resolveRawNumber', () => {
    expect(serverSource).toContain('resolveRawNumber(req.body.From || req.body.callerNumber)');
    expect(serverSource).toContain('resolveRawNumber(req.body.To || req.body.recipientNumber)');
  });
});
