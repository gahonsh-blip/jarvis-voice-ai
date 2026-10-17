import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { recordedAccountName, oauthConnectionNotice } from '../utils/hardening/oauthAccountNoticeTruth';

const flatten = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\s+/g, ' ');

describe('recordedAccountName', () => {
  it('returns a trimmed real name', () => {
    expect(recordedAccountName('  Gahon  ')).toBe('Gahon');
  });

  it('returns null for missing, blank or non-string input', () => {
    expect(recordedAccountName(undefined)).toBeNull();
    expect(recordedAccountName(null)).toBeNull();
    expect(recordedAccountName('')).toBeNull();
    expect(recordedAccountName('   ')).toBeNull();
    expect(recordedAccountName(42)).toBeNull();
    expect(recordedAccountName({})).toBeNull();
  });
});

describe('oauthConnectionNotice', () => {
  it('names the LinkedIn profile when a name was returned', () => {
    const notice = oauthConnectionNotice('linkedin', 'Gahon');
    expect(notice.named).toBe(true);
    expect(notice.notice).toContain('Gahon');
    expect(notice.spoken).toContain('Gahon');
  });

  it('does not invent a LinkedIn member name when none was returned', () => {
    const notice = oauthConnectionNotice('linkedin', undefined);
    expect(notice.named).toBe(false);
    expect(notice.notice).not.toContain('LinkedIn Member');
    expect(notice.spoken).not.toContain('Member');
    expect(notice.notice.toLowerCase()).toContain('not returned');
  });

  it('names the YouTube channel when a title was returned', () => {
    const notice = oauthConnectionNotice('youtube', 'My Channel');
    expect(notice.named).toBe(true);
    expect(notice.notice).toContain('My Channel');
    expect(notice.spoken).toContain('My Channel');
  });

  it('does not invent a YouTube channel name when none was returned', () => {
    const notice = oauthConnectionNotice('youtube', '   ');
    expect(notice.named).toBe(false);
    expect(notice.notice).not.toMatch(/Channel "Channel"/);
    expect(notice.notice.toLowerCase()).toContain('not returned');
  });
});

describe('SocialMediaModal wiring', () => {
  const modal = flatten('src/components/SocialMediaModal.tsx');

  it('routes both OAuth success notices through the helper', () => {
    expect(modal).toContain("oauthConnectionNotice('linkedin', event.data.member?.name)");
    expect(modal).toContain("oauthConnectionNotice('youtube', event.data.channel?.channelTitle)");
  });

  it('no longer emits the invented fallback literals', () => {
    expect(modal).not.toContain("event.data.member?.name || 'LinkedIn Member'");
    expect(modal).not.toContain("event.data.member?.name || 'Member'");
    expect(modal).not.toContain("event.data.channel?.channelTitle || 'Channel'");
  });
});
