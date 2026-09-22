import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDisplayNumber, shouldMaskParty } from '../utils/telephonyPrivacyDisplay';
import { maskPhoneNumber } from '../utils/telephonyPermissions';
import { DEFAULT_CONTACTS, ContactItem } from '../types/telephony';

// Regression guard for the telephony privacy-display leak.
//
// ActiveCallHUD and the Telephony Hub call-history panel rendered a "MASKED" /
// "PRIVACY MASKED" badge over an unknown inbound caller while still printing
// the raw carrier number directly beneath it. The number was exposed exactly
// when the UI claimed to hide it. These tests pin the fix at two levels: the
// helper's behaviour, and the shipped source no longer rendering the raw field
// on a masked party.

const SRC_DIR = path.resolve(__dirname, '..');
const readSrc = (rel: string) => fs.readFileSync(path.join(SRC_DIR, rel), 'utf8');

const UNKNOWN_NUMBER = '+91 98765 43210';
const KNOWN_NUMBER = DEFAULT_CONTACTS[0].number;

describe('telephony privacy display helper', () => {
  it('masks an unknown number only when masking is enabled', () => {
    expect(shouldMaskParty(UNKNOWN_NUMBER, DEFAULT_CONTACTS, true)).toBe(true);
    expect(shouldMaskParty(UNKNOWN_NUMBER, DEFAULT_CONTACTS, false)).toBe(false);
  });

  it('never masks a saved contact', () => {
    const contacts: ContactItem[] = DEFAULT_CONTACTS;
    expect(shouldMaskParty(KNOWN_NUMBER, contacts, true)).toBe(false);
    expect(resolveDisplayNumber(KNOWN_NUMBER, contacts, true)).toBe(KNOWN_NUMBER);
  });

  it('returns the masked form, not the raw number, for a masked party', () => {
    const shown = resolveDisplayNumber(UNKNOWN_NUMBER, DEFAULT_CONTACTS, true);
    expect(shown).toBe(maskPhoneNumber(UNKNOWN_NUMBER));
    expect(shown).not.toContain('43210');
    expect(shown).toContain('****');
  });

  it('leaves the number untouched when masking is disabled', () => {
    expect(resolveDisplayNumber(UNKNOWN_NUMBER, DEFAULT_CONTACTS, false)).toBe(UNKNOWN_NUMBER);
  });

  it('treats a missing number as an empty string', () => {
    expect(resolveDisplayNumber(undefined, DEFAULT_CONTACTS, true)).toBe('');
    expect(resolveDisplayNumber(null, DEFAULT_CONTACTS, true)).toBe('');
  });
});

describe('telephony components do not leak a masked number', () => {
  it('ActiveCallHUD renders the caller number through the privacy helper', () => {
    const src = readSrc('components/ActiveCallHUD.tsx');
    expect(src).toContain("from '../utils/telephonyPrivacyDisplay'");
    expect(src).toContain('resolveDisplayNumber(activeCall.callerNumber');
    // The raw field must never be interpolated straight into JSX.
    expect(src).not.toContain('{activeCall.callerNumber}');
  });

  it('TelephonyHubModal renders the log caller number through the privacy helper', () => {
    const src = readSrc('components/TelephonyHubModal.tsx');
    expect(src).toContain("from '../utils/telephonyPrivacyDisplay'");
    expect(src).toContain('resolveDisplayNumber(selectedLog.callerNumber');
    expect(src).not.toContain(': selectedLog.callerNumber}');
  });
});
