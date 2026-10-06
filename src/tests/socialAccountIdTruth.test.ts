import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  observedAccountName,
  describeVerifiedAccount,
  ACCOUNT_NAME_NOT_RETURNED_LABEL,
} from '../utils/hardening/socialAccountIdTruth';

// Item 13 ("zero fake success") — the live connection probes in server.ts named
// an account the provider never returned. `testPlatformConnection()` answers
// `success: true, status: 'VERIFIED'` when the token authenticates, but the
// NAME it reported fell back to the invented literals:
//   • LinkedIn  — `|| 'LinkedIn Member'`
//   • Facebook  — `data.name || 'Facebook Page'`
//   • Instagram — `data.name || 'Instagram Account'`
//   • YouTube   — `item.snippet?.title || 'YouTube Channel'`
// The authenticated account is real; the name was not measured. The helper
// returns the observed name or null, and the caller states that the provider did
// not return a name instead of inventing one.

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
const squeezed = (rel: string) => read(rel).replace(/\s+/g, ' ');

describe('Item 13 — live social account name is never invented', () => {
  it('treats every historical placeholder name as not observed', () => {
    expect(observedAccountName('LinkedIn Member')).toBeNull();
    expect(observedAccountName('Facebook Page')).toBeNull();
    expect(observedAccountName('Instagram Account')).toBeNull();
    expect(observedAccountName('YouTube Channel')).toBeNull();
    expect(observedAccountName('YouTube User')).toBeNull();
  });

  it('treats blank and non-string values as not observed', () => {
    expect(observedAccountName('')).toBeNull();
    expect(observedAccountName('   ')).toBeNull();
    expect(observedAccountName(undefined)).toBeNull();
    expect(observedAccountName(null)).toBeNull();
    expect(observedAccountName(42)).toBeNull();
  });

  it('returns a real observed name, trimmed', () => {
    expect(observedAccountName('  Ada Lovelace  ')).toBe('Ada Lovelace');
    expect(observedAccountName('@jarvislabs')).toBe('@jarvislabs');
  });

  it('describeVerifiedAccount falls back to the real identifier, then says so', () => {
    expect(describeVerifiedAccount('linkedin', 'Ada Lovelace', 'urn:li:person:42')).toBe('Ada Lovelace');
    // No name → the real URN is the honest identity.
    expect(describeVerifiedAccount('linkedin', null, 'urn:li:person:42')).toBe('urn:li:person:42');
    // No name and no identifier → state that no name was returned.
    expect(describeVerifiedAccount('facebook', null, null)).toBe(ACCOUNT_NAME_NOT_RETURNED_LABEL);
    expect(describeVerifiedAccount('instagram', 'Instagram Account', '')).toBe(ACCOUNT_NAME_NOT_RETURNED_LABEL);
    expect(describeVerifiedAccount('youtube', 'YouTube Channel', '')).toMatch(/not returned/i);
    // The label itself must not read as an account name.
    expect(ACCOUNT_NAME_NOT_RETURNED_LABEL).toMatch(/not returned/i);
  });

  it('server.ts no longer invents a LinkedIn account name', () => {
    const src = squeezed('server.ts');
    expect(src).not.toContain("|| 'LinkedIn Member'");
    expect(src).toContain("observedAccountName(data?.name)");
  });

  it('server.ts no longer invents a Facebook page name', () => {
    const src = squeezed('server.ts');
    expect(src).not.toContain("data.name || 'Facebook Page'");
    expect(src).toContain("observedAccountName(data.name)");
  });

  it('server.ts no longer invents an Instagram account name', () => {
    const src = squeezed('server.ts');
    expect(src).not.toContain("data.name || 'Instagram Account'");
  });

  it('server.ts no longer invents a YouTube channel name', () => {
    const src = squeezed('server.ts');
    expect(src).not.toContain("item.snippet?.title || 'YouTube Channel'");
    expect(src).not.toContain("userData.name || userData.email || 'YouTube User'");
    expect(src).toContain("observedAccountName(item.snippet?.title)");
  });
});
