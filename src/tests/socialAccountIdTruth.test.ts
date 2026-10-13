import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  observedAccountName,
  describeVerifiedAccount,
  disconnectAccountLabel,
  connectedLinkedInIdentity,
  connectedYouTubeChannelId,
  linkedInAuthorUrnLabel,
  resolveLinkedInAuthorUrn,
  LEGACY_LINKEDIN_SELF_URN,
  AUTHOR_URN_NOT_RECORDED_LABEL,
  ACCOUNT_NAME_NOT_RETURNED_LABEL,
  CHANNEL_ID_NOT_RECORDED_LABEL,
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

describe('Item 13 — an OAuth disconnect never names an account it did not read', () => {
  it('treats the disconnect placeholders as not observed', () => {
    expect(observedAccountName('LinkedIn User')).toBeNull();
    expect(observedAccountName('YouTube Account')).toBeNull();
  });

  it('returns the recorded name when one exists, else states none was read', () => {
    expect(disconnectAccountLabel('Ada Lovelace')).toBe('Ada Lovelace');
    expect(disconnectAccountLabel('  Ada Lovelace  ')).toBe('Ada Lovelace');
    // Blank, missing, or a historical placeholder must never become a name.
    for (const raw of ['', '   ', undefined, null, 'LinkedIn User', 'YouTube Account', 'YouTube Channel']) {
      const label = disconnectAccountLabel(raw);
      expect(label).not.toBe('LinkedIn User');
      expect(label).not.toBe('YouTube Account');
      expect(label).toMatch(/not recorded/i);
    }
  });

  it('server.ts no longer hardcodes a placeholder into the disconnect audit rows', () => {
    const src = squeezed('server.ts');
    expect(src).not.toContain("memoryState.linkedInConnection.name || 'LinkedIn User'");
    expect(src).not.toContain("memoryState.youTubeConnection.channelTitle || 'YouTube Account'");
    expect(src).toContain('disconnectAccountLabel(memoryState.linkedInConnection.name)');
    expect(src).toContain('disconnectAccountLabel(memoryState.youTubeConnection.channelTitle)');
  });
});

describe('Item 13 — a connected-account banner never invents the account identity', () => {
  it('connectedLinkedInIdentity returns the observed name, else says none was returned', () => {
    expect(connectedLinkedInIdentity('Ada Lovelace')).toBe('Ada Lovelace');
    expect(connectedLinkedInIdentity('  Ada Lovelace  ')).toBe('Ada Lovelace');
    // Blank, missing, non-string, or a historical placeholder must never become
    // the invented "Personal Member" / "Authenticated Member" identity.
    for (const raw of ['', '   ', undefined, null, 42, 'LinkedIn Member', 'Personal Member']) {
      expect(connectedLinkedInIdentity(raw)).toBe(ACCOUNT_NAME_NOT_RETURNED_LABEL);
    }
    expect(ACCOUNT_NAME_NOT_RETURNED_LABEL).toMatch(/not returned/i);
  });

  it('connectedYouTubeChannelId returns the recorded ID, else says no channel was read', () => {
    expect(connectedYouTubeChannelId('UChdG0AL8NdFtGHzNY-C6XnQ')).toBe('UChdG0AL8NdFtGHzNY-C6XnQ');
    expect(connectedYouTubeChannelId('  UChdG0AL8NdFtGHzNY-C6XnQ  ')).toBe('UChdG0AL8NdFtGHzNY-C6XnQ');
    for (const raw of ['', '   ', undefined, null, 42]) {
      expect(connectedYouTubeChannelId(raw)).toBe(CHANNEL_ID_NOT_RECORDED_LABEL);
    }
    // The label itself must not read as a channel ID or an account name.
    expect(CHANNEL_ID_NOT_RECORDED_LABEL).toMatch(/not recorded/i);
    expect(CHANNEL_ID_NOT_RECORDED_LABEL).not.toMatch(/authenticated/i);
  });

  it('the Social Hub connected banners no longer invent an account identity', () => {
    const src = squeezed('src/components/SocialMediaModal.tsx');
    expect(src).not.toContain("'Authenticated Member'");
    expect(src).not.toContain("'Authenticated Google Account'");
    expect(src).not.toContain("oauth.name || 'Personal Member'");
    expect(src).toContain('connectedLinkedInIdentity(linkedInInfo?.accountName)');
    expect(src).toContain('connectedLinkedInIdentity(oauth.name)');
    expect(src).toContain('connectedYouTubeChannelId(ytOauth.channelId)');
  });
});

describe('Item 13 — the LinkedIn banner never fabricates a member URN', () => {
  it('returns the recorded author URN when one was read', () => {
    expect(linkedInAuthorUrnLabel('urn:li:person:abc123', undefined)).toBe('urn:li:person:abc123');
    expect(linkedInAuthorUrnLabel('  urn:li:person:abc123  ', 'xyz')).toBe('urn:li:person:abc123');
  });

  it('derives the URN from a real member sub when the author URN is absent', () => {
    expect(linkedInAuthorUrnLabel(undefined, 'abc123')).toBe('urn:li:person:abc123');
    expect(linkedInAuthorUrnLabel('', '  abc123  ')).toBe('urn:li:person:abc123');
  });

  it('never fabricates `urn:li:person:self` for an unread member', () => {
    // The historical placeholder sub is not a real member identity.
    expect(linkedInAuthorUrnLabel(undefined, 'self')).toBe(AUTHOR_URN_NOT_RECORDED_LABEL);
    for (const [urn, sub] of [
      [undefined, undefined],
      ['', ''],
      ['   ', '   '],
      [null, null],
      [42, 42],
      ['', 'self'],
    ] as [unknown, unknown][]) {
      const label = linkedInAuthorUrnLabel(urn, sub);
      expect(label).not.toMatch(/person:self/);
      expect(label).toBe(AUTHOR_URN_NOT_RECORDED_LABEL);
    }
    expect(AUTHOR_URN_NOT_RECORDED_LABEL).toMatch(/not recorded/i);
    expect(AUTHOR_URN_NOT_RECORDED_LABEL).not.toMatch(/urn:li:person/);
  });

  it('the LinkedIn banner no longer falls back to `urn:li:person:self`', () => {
    const src = squeezed('src/components/SocialMediaModal.tsx');
    expect(src).not.toContain("oauth.memberSub || 'self'");
    expect(src).toContain('linkedInAuthorUrnLabel(oauth.authorUrn, oauth.memberSub)');
  });
});

describe('Item 13 — the LinkedIn publish path refuses an unresolved author', () => {
  it('resolves the author URN from a recorded URN, else a real member sub', () => {
    expect(resolveLinkedInAuthorUrn('urn:li:person:abc123', undefined)).toBe('urn:li:person:abc123');
    expect(resolveLinkedInAuthorUrn('  urn:li:person:abc123  ', 'xyz')).toBe('urn:li:person:abc123');
    expect(resolveLinkedInAuthorUrn(undefined, 'abc123')).toBe('urn:li:person:abc123');
    expect(resolveLinkedInAuthorUrn('', '  abc123  ')).toBe('urn:li:person:abc123');
  });

  it('treats the legacy `urn:li:person:self` (and sub `self`) as unresolved', () => {
    expect(resolveLinkedInAuthorUrn(LEGACY_LINKEDIN_SELF_URN, undefined)).toBeNull();
    expect(resolveLinkedInAuthorUrn(LEGACY_LINKEDIN_SELF_URN, 'abc123')).toBe('urn:li:person:abc123');
    expect(resolveLinkedInAuthorUrn(undefined, 'self')).toBeNull();
    for (const [urn, sub] of [
      [undefined, undefined],
      ['', ''],
      ['   ', '   '],
      [null, null],
      [42, 42],
      ['urn:li:person:self', 'self'],
    ] as [unknown, unknown][]) {
      expect(resolveLinkedInAuthorUrn(urn, sub)).toBeNull();
    }
  });

  it('the LinkedIn publish path no longer falls back to `urn:li:person:self`', () => {
    const src = squeezed('server.ts');
    expect(src).not.toContain("targetAuthor = 'urn:li:person:self'");
    expect(src).toContain('resolveLinkedInAuthorUrn(configuredUrn, oauthConn?.memberSub)');
    // The connect callback must not persist the placeholder as a real member.
    expect(src).not.toContain("let authorUrn = 'urn:li:person:self'");
    // The /api/auth/linkedin/status route must not display the placeholder.
    expect(src).not.toContain("authorUrn: staticUrn || 'urn:li:person:self'");
  });
});

