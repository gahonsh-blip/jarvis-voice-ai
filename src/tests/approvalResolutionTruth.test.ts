// ==============================================================================
// Approval resolution truth guard.
//
// Regression: /api/approvals/resolve stamped status EXECUTED with
// verificationStatus/finalTruthState VERIFIED and a synthetic
// `urn:jarvis:executed:<id>` result, even when no execution branch ran. These
// tests pin the honest classification of what the dispatcher actually returned.
// ==============================================================================
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyApprovalOutcome, formatUnconfirmedMobileApprovalReply } from '../utils/hardening/approvalResolution';

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

// item 13, continued — the Telegram mobile approval reply. `handleTelegramCallback`
// only flips status to EXECUTED and dispatches nothing, yet it replied
// "LEVEL 4 ACTION APPROVED & EXECUTED ... EXECUTED (Verified)". The helper is the
// only thing that builds that reply now, so pin its honesty here.
describe('formatUnconfirmedMobileApprovalReply — approval is not execution', () => {
  it('never claims the external action was executed or verified', () => {
    const reply = formatUnconfirmedMobileApprovalReply({
      id: 'perm-1',
      exactAction: 'Publish LinkedIn post',
      target: 'linkedin.com/feed',
      status: 'EXECUTED',
    });
    expect(reply).not.toMatch(/APPROVED & EXECUTED/i);
    expect(reply).not.toMatch(/\(Verified\)/i);
    expect(reply).toMatch(/EXECUTION NOT CONFIRMED/i);
    expect(reply).toMatch(/UNVERIFIED/);
    expect(reply).toMatch(/NOT dispatched by this path/);
  });

  it('still identifies the action and target so the operator knows what was recorded', () => {
    const reply = formatUnconfirmedMobileApprovalReply({
      id: 'perm-2',
      exactAction: 'Create GitHub issue',
      target: 'gahonsh-blip/jarvis-voice-ai',
      status: 'EXECUTED',
    });
    expect(reply).toContain('Create GitHub issue');
    expect(reply).toContain('gahonsh-blip/jarvis-voice-ai');
  });

  it('does not report EXECUTED when the recorded status is not EXECUTED', () => {
    const reply = formatUnconfirmedMobileApprovalReply({
      id: 'perm-3',
      exactAction: 'Deploy to production',
      status: 'FAILED',
    });
    expect(reply).not.toMatch(/APPROVAL RECORDED/i);
    expect(reply).toMatch(/FAILED/);
    expect(reply).toMatch(/nothing was confirmed to have run/i);
  });

  it('falls back to the request id rather than inventing an action name', () => {
    const reply = formatUnconfirmedMobileApprovalReply({ id: 'perm-4', status: 'EXECUTED' });
    expect(reply).toContain('perm-4');
  });
});

describe('server.ts mobile approval branch routes through the honest reply', () => {
  const serverSource = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');

  it('no longer states the mobile approval as executed and verified', () => {
    expect(serverSource).not.toContain('APPROVED & EXECUTED');
    expect(serverSource).not.toContain('EXECUTED (Verified)');
  });

  it('builds the approve_perm_ reply with the shared helper', () => {
    expect(serverSource).toContain('formatUnconfirmedMobileApprovalReply(updated)');
  });
});