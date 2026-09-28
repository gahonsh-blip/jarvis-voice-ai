// ==============================================================================
// HERMES JARVIS — FINANCE GUARD FALSE-POSITIVE REGRESSION (backlog item 13)
//
// `isFinanceBlocked()` in `server_tools.ts` matched a bare `lower.includes(kw)`
// fallback alongside the word-boundary regex. Several finance tokens are short
// enough to occur inside ordinary English words:
//
//   eth  -> "whETHer", "togE THer"     btc -> (rare, but substring-matched)
//   upi  -> (no common word)           cvv -> (no common word)
//   eth  -> "mETHod"                   bhim -> (no common word)
//
// A false positive here is a correctness bug on a safety-critical path: benign
// operator conversation was classified as a blocked financial operation. These
// tests pin the word-boundary-only behaviour so the fallback cannot return.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { isFinanceBlocked } from '../../server_tools';

describe('isFinanceBlocked — no substring false positives', () => {
  it.each([
    'tell me whether the build passed',
    'run the tests together',
    'use a different method for this',
    'recall the previous conversation',
    'the weather is fine today',
    'gather the logs from the last hour',
    'better to check the status first',
  ])('does not block benign text containing a short finance token: %s', (text) => {
    const result = isFinanceBlocked(text);
    expect(result.blocked, `"${text}" was blocked by "${result.reason ?? ''}"`).toBe(false);
  });

  it('still blocks real financial intent after the fallback removal', () => {
    for (const text of [
      'transfer money to the client account',
      'pay via UPI to vendor',
      'buy bitcoin today',
      'withdraw money from the wallet',
      'settle the credit card bill',
      'check the wallet balance',
    ]) {
      expect(isFinanceBlocked(text).blocked, text).toBe(true);
    }
  });
});
