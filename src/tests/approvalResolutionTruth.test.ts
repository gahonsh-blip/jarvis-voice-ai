// ==============================================================================
// Approval resolution truth guard.
//
// Regression: /api/approvals/resolve stamped status EXECUTED with
// verificationStatus/finalTruthState VERIFIED and a synthetic
// `urn:jarvis:executed:<id>` result, even when no execution branch ran. These
// tests pin the honest classification of what the dispatcher actually returned.
// ==============================================================================
import { describe, it, expect } from 'vitest';
import { classifyApprovalOutcome } from '../utils/hardening/approvalResolution';

describe('classifyApprovalOutcome — no false success', () => {
  it('treats a missing execution result as UNVERIFIED, never success', () => {
    const r = classifyApprovalOutcome(null);
    expect(r.executed).toBe(false);
    expect(r.outcome).toBe('UNVERIFIED');
    expect(r.evidenceRef).toBeUndefined();
  });

  it('treats an unmatched default { executed: true } as UNVERIFIED', () => {
    // The old handler defaulted to `{ executed: true }` when no branch matched.
    const r = classifyApprovalOutcome({ executed: true });
    expect(r.executed).toBe(false);
    expect(r.outcome).toBe('UNVERIFIED');
  });

  it('does not verify a social post the provider never confirmed an id for', () => {
    const r = classifyApprovalOutcome({
      success: false,
      post: { finalTruthState: 'UNVERIFIED', providerUrn: '' },
    });
    expect(r.executed).toBe(false);
    expect(r.outcome).toBe('UNVERIFIED');
    expect(r.evidenceRef).toBeUndefined();
  });

  it('verifies a social post only with a real provider URN', () => {
    const r = classifyApprovalOutcome({
      success: true,
      post: { finalTruthState: 'VERIFIED', providerUrn: 'urn:li:share:7123456789' },
    });
    expect(r.executed).toBe(true);
    expect(r.outcome).toBe('VERIFIED');
    expect(r.evidenceRef).toBe('urn:li:share:7123456789');
  });

  it('ignores a VERIFIED flag with no provider identifier', () => {
    const r = classifyApprovalOutcome({
      success: true,
      post: { finalTruthState: 'VERIFIED', providerUrn: '' },
    });
    expect(r.executed).toBe(false);
    expect(r.outcome).not.toBe('VERIFIED');
  });

  it('verifies a GitHub issue only with a real issue URL', () => {
    const ok = classifyApprovalOutcome({ success: true, issueUrl: 'https://github.com/o/r/issues/7' });
    expect(ok.outcome).toBe('VERIFIED');
    expect(ok.evidenceRef).toBe('https://github.com/o/r/issues/7');

    const missing = classifyApprovalOutcome({ success: true, issueNumber: 7 });
    expect(missing.executed).toBe(false);
    expect(missing.outcome).toBe('UNVERIFIED');
  });

  it('reports a real provider failure as FAILED, not executed', () => {
    const r = classifyApprovalOutcome({ success: false, error: 'HTTP 401' });
    expect(r.executed).toBe(false);
    expect(r.outcome).toBe('FAILED');
  });

  it('never emits a synthetic `urn:jarvis:executed:` identifier', () => {
    const cases = [null, { executed: true }, { success: true }, { success: true, post: {} }];
    for (const c of cases) {
      const r = classifyApprovalOutcome(c);
      expect(r.evidenceRef || '').not.toContain('urn:jarvis:executed:');
    }
  });
});