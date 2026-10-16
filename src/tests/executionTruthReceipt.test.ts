// ==============================================================================
// Tests for the execution-truth receipt guard.
//
// buildReceipt is the single chokepoint every module uses to decide whether an
// action may be reported as done. The property proven here: VERIFIED can only
// survive when the caller supplies substantive evidence. Evidence of kind
// `none` is the vocabulary's own "nothing was observed" and must not slip
// through the guard.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  buildReceipt,
  makeEvidence,
  isSubstantiveEvidence,
  type ReceiptInit,
} from '../utils/executionTruth';

function receipt(init: Partial<ReceiptInit> & Pick<ReceiptInit, 'outcome'>) {
  return buildReceipt({
    action: 'test.action',
    target: 'test-target',
    detailEn: 'test',
    detailHi: 'परीक्षण',
    ...init,
  });
}

describe('buildReceipt verification guard', () => {
  it('keeps VERIFIED when real evidence is supplied', () => {
    const r = receipt({
      outcome: 'VERIFIED',
      evidence: makeEvidence('os_command', 'command exited 0', { ref: 'true' }),
    });
    expect(r.outcome).toBe('VERIFIED');
    expect(r.verified).toBe(true);
  });

  it('downgrades VERIFIED with no evidence to DISPATCHED', () => {
    const r = receipt({ outcome: 'VERIFIED', evidence: null });
    expect(r.outcome).toBe('DISPATCHED');
    expect(r.verified).toBe(false);
    expect(r.detailEn).toContain('no verification evidence was supplied');
  });

  it('downgrades VERIFIED whose evidence is kind "none" to UNVERIFIED', () => {
    const r = receipt({
      outcome: 'VERIFIED',
      evidence: makeEvidence('none', 'Empty plan'),
    });
    expect(r.outcome).toBe('UNVERIFIED');
    expect(r.verified).toBe(false);
    expect(r.detailEn).toContain('kind "none" proves nothing');
    expect(r.failureReason).toBeTruthy();
  });

  it('never leaves a non-VERIFIED outcome claiming verified', () => {
    for (const outcome of ['FAILED', 'BLOCKED', 'NOT_CONFIGURED', 'DISPATCHED'] as const) {
      const r = receipt({ outcome, evidence: makeEvidence('os_command', 'x') });
      expect(r.verified).toBe(false);
      expect(r.outcome).toBe(outcome);
    }
  });
});

describe('isSubstantiveEvidence', () => {
  it('rejects null, undefined and kind "none"', () => {
    expect(isSubstantiveEvidence(null)).toBe(false);
    expect(isSubstantiveEvidence(undefined)).toBe(false);
    expect(isSubstantiveEvidence(makeEvidence('none', 'nothing'))).toBe(false);
  });

  it('accepts every real observation kind', () => {
    for (const kind of ['local_file', 'os_command', 'remote_http_response', 'device_ack'] as const) {
      expect(isSubstantiveEvidence(makeEvidence(kind, 'observed'))).toBe(true);
    }
  });
});
