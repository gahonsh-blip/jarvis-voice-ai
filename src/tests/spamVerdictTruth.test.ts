import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  NO_SPAM_MATCH_REASON,
  spamReasonLabel,
} from '../utils/hardening/spamVerdictTruth';
import { evaluateSpamRisk } from '../utils/telephonyEngine';

// item 13 — the spam screen's own verdict. `evaluateSpamRisk()` stamped
// 'Verified Legitimate Caller' on every first line that matched none of its
// nine keywords, which is a trust verdict the keyword matcher never earned.

describe('spamReasonLabel never promotes a no-match screen to a legitimacy verdict', () => {
  it('returns the neutral no-match reason for an empty or whitespace reason', () => {
    expect(spamReasonLabel('')).toBe(NO_SPAM_MATCH_REASON);
    expect(spamReasonLabel(null)).toBe(NO_SPAM_MATCH_REASON);
    expect(spamReasonLabel(undefined)).toBe(NO_SPAM_MATCH_REASON);
    expect(spamReasonLabel('   ')).toBe(NO_SPAM_MATCH_REASON);
  });

  it('preserves a real match reason verbatim', () => {
    const match = 'Solar panel sales solicitation';
    expect(spamReasonLabel(match)).toBe(match);
  });

  it('the no-match reason states the absence of an indicator, not a vetting', () => {
    expect(NO_SPAM_MATCH_REASON).not.toMatch(/verified/i);
    expect(NO_SPAM_MATCH_REASON).not.toMatch(/legitimate/i);
  });
});

describe('evaluateSpamRisk reports an unmatched screen as unmatched', () => {
  it('an ordinary greeting yields score 0 and the neutral reason, never a legitimacy claim', () => {
    const result = evaluateSpamRisk('+91 90000 00000', 'Hello, is this a good time to talk?');
    expect(result.isSpam).toBe(false);
    expect(result.score).toBe(0);
    expect(result.reason).toBe(NO_SPAM_MATCH_REASON);
    expect(result.reason).not.toMatch(/verified/i);
    expect(result.reason).not.toMatch(/legitimate/i);
  });

  it('a keyword match still reports the matched indicator', () => {
    const result = evaluateSpamRisk('+1 (800) 991-8273', 'Congratulations, you are pre-selected for solar');
    expect(result.isSpam).toBe(true);
    expect(result.reason).toBeTruthy();
    expect(result.reason).not.toBe(NO_SPAM_MATCH_REASON);
  });
});

describe('telephonyEngine source no longer contains the legitimacy stamp', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../utils/telephonyEngine.ts'),
    'utf8'
  );

  it('removed the hardcoded "Verified Legitimate Caller" literal', () => {
    expect(src).not.toContain('Verified Legitimate Caller');
  });

  it('routes the fallback through spamReasonLabel', () => {
    expect(src).toContain('spamReasonLabel');
  });
});
