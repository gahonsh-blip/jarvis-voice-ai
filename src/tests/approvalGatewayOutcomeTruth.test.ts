// HERMES JARVIS — Permission Gateway decision honesty (backlog item 13).
//
// `POST /api/approvals/resolve` returns `success` (did the action run) and
// `persisted` (is the terminal decision durable) as independent facts. The
// gateway UI used to branch only on `data.success`, so:
//   * a `{ success: true, persisted: false }` body rendered the plain
//     "Authorized & Executed" banner even though the decision was not on disk;
//   * the route's honest unpersisted-terminal-decision answer — HTTP 500
//     `{ success: false, persisted: false, outcome: 'UNPERSISTED' }`, with the
//     decision rolled back to PENDING_APPROVAL — fell into the generic
//     "Execution halted" branch and never told the operator the decision was
//     rolled back and would not survive a restart.
//
// These tests pin both the classifier and the component wiring.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyApproveOutcome,
  classifyRejectOutcome,
} from '../utils/hardening/approvalGatewayOutcomeTruth';

const gatewaySource = fs.readFileSync(
  path.resolve(__dirname, '../components/PermissionGateway.tsx'),
  'utf-8'
);

describe('classifyApproveOutcome — a decision is only "recorded" when it is durable', () => {
  it('reports full success only when the action ran AND the decision persisted', () => {
    const outcome = classifyApproveOutcome(
      { success: true, persisted: true },
      'LinkedIn Post'
    );
    expect(outcome.tone).toBe('success');
    expect(outcome.message).toContain('Authorized & Executed');
    expect(outcome.message).toContain('LinkedIn Post');
  });

  it('does not claim a durable record when the action ran but the write was refused', () => {
    const outcome = classifyApproveOutcome(
      { success: true, persisted: false },
      'LinkedIn Post'
    );
    expect(outcome.tone).not.toBe('success');
    expect(outcome.message).toMatch(/not written to durable storage/i);
    expect(outcome.message).toMatch(/survive a restart/i);
    // The old code rendered the plain success banner here.
    expect(outcome.message).not.toBe('✅ Authorized & Executed: "LinkedIn Post"');
  });

  it('names the rollback for an UNPERSISTED decision instead of a generic halt', () => {
    const outcome = classifyApproveOutcome(
      { success: false, persisted: false, outcome: 'UNPERSISTED' },
      'GitHub Issue'
    );
    expect(outcome.tone).toBe('error');
    expect(outcome.message).toMatch(/rolled back/i);
    expect(outcome.message).toMatch(/still pending/i);
    expect(outcome.message).not.toMatch(/Execution halted/);
  });

  it('keeps the UNVERIFIED (recorded, no provider confirmation) wording', () => {
    const outcome = classifyApproveOutcome(
      { success: false, outcome: 'UNVERIFIED', message: 'no provider confirmation received.' },
      'LinkedIn Post'
    );
    expect(outcome.tone).toBe('error');
    expect(outcome.message).toMatch(/Not confirmed/);
  });

  it('surfaces the server error for any other failure', () => {
    const outcome = classifyApproveOutcome({ success: false, error: 'postId is required' }, 'X');
    expect(outcome.tone).toBe('error');
    expect(outcome.message).toBe('postId is required');
  });
});

describe('classifyRejectOutcome — a rejection is only "recorded" when it is durable', () => {
  it('confirms a recorded rejection', () => {
    const outcome = classifyRejectOutcome({ success: true, persisted: true }, 'LinkedIn Post');
    expect(outcome.message).toMatch(/cancelled safely/);
  });

  it('warns when the rejection could not be written to durable storage', () => {
    const outcome = classifyRejectOutcome({ success: true, persisted: false }, 'LinkedIn Post');
    expect(outcome.message).toMatch(/not written to durable storage/i);
    expect(outcome.message).toMatch(/survive a restart/i);
  });

  it('does not silently succeed when the route refused the rejection', () => {
    const outcome = classifyRejectOutcome(
      { success: false, persisted: false, error: 'The rejection could not be written to durable storage; it was not recorded.' },
      'LinkedIn Post'
    );
    expect(outcome.message).toMatch(/Rejection not recorded/);
    expect(outcome.message).not.toMatch(/cancelled safely/);
  });
});

describe('PermissionGateway wiring — the decision durability flag is read, not ignored', () => {
  it('routes both handlers through the classifiers', () => {
    expect(gatewaySource).toMatch(/classifyApproveOutcome\(data, reqToApprove\.exactAction\)/);
    expect(gatewaySource).toMatch(/classifyRejectOutcome\(data, reqToReject\.exactAction\)/);
  });

  it('no longer branches the decision result on `data.success` alone', () => {
    expect(gatewaySource).not.toMatch(/if \(data\.success\) \{\s*showNotification\(`✅ Authorized & Executed/);
    expect(gatewaySource).not.toMatch(/if \(data\.success\) \{\s*showNotification\(`❌ Rejected/);
  });
});
