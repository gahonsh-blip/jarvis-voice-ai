import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONTACTS } from '../types/telephony';

// Regression guard for a zero-fake-success gap (item 13).
//
// The Telephony Hub privacy panel printed "Contact list: N verified numbers"
// using `contacts.length`, where `contacts` fell back to DEFAULT_CONTACTS — five
// fictional people with fictional phone numbers and no device source behind
// them. The panel asserted that five numbers were "verified" when none were.
// These tests pin the fix at two levels: the data carries its provenance, and
// the shipped source counts only contacts that actually have a source.

const SRC_DIR = path.resolve(__dirname, '..');
const readSrc = (rel: string) => fs.readFileSync(path.join(SRC_DIR, rel), 'utf8');

describe('telephony contact provenance', () => {
  it('marks every built-in placeholder contact as sample data', () => {
    expect(DEFAULT_CONTACTS.length).toBeGreaterThan(0);
    for (const c of DEFAULT_CONTACTS) {
      expect(c.isSample).toBe(true);
    }
  });

  it('counts zero verified numbers among the built-in contacts', () => {
    const verified = DEFAULT_CONTACTS.filter((c) => !c.isSample).length;
    expect(verified).toBe(0);
  });
});

describe('TelephonyHubModal does not present sample contacts as verified', () => {
  it('no longer prints contacts.length as verified numbers', () => {
    const src = readSrc('components/TelephonyHubModal.tsx');
    expect(src).not.toContain('{contacts.length} verified numbers');
  });

  it('derives the verified count from non-sample contacts', () => {
    const src = readSrc('components/TelephonyHubModal.tsx');
    expect(src).toContain('effectiveContacts.filter((c) => !c.isSample).length');
    expect(src).toContain('${savedContactCount} verified numbers');
  });

  it('names the sample contacts when no verified number is saved', () => {
    const src = readSrc('components/TelephonyHubModal.tsx');
    expect(src).toContain('SAMPLE contacts');
    expect(src).toContain('no verified numbers saved');
  });
});
