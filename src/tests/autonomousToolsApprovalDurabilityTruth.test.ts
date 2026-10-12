// HERMES JARVIS — Autonomous Tools approval-gate decision honesty (backlog item 13).
//
// The AutonomousToolsModal "approvals" tab resolved `POST /api/approvals/resolve`
// through the same endpoint as the Permission Gateway, but branched only on
// `data.success`:
//   * `{ success: true, persisted: false }` (the action ran but the terminal
//     decision could not be written) rendered "✅ Action executed successfully"
//     for a decision a restart would forget;
//   * the route's honest unpersisted answer — HTTP 500
//     `{ success: false, persisted: false, outcome: 'UNPERSISTED' }`, decision
//     rolled back to PENDING_APPROVAL — fell into the generic
//     "Execution blocked" branch, hiding the rollback.
//
// These tests pin the -now shared- classifier and the modal wiring.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyApproveOutcome,
  classifyRejectOutcome,
} from '../utils/hardening/approvalGatewayOutcomeTruth';

const modalSource = fs.readFileSync(
  path.resolve(__dirname, '../components/AutonomousToolsModal.tsx'),
  'utf-8'
);

describe('Approval decision honesty — an executed-but-unpersisted decision is not a plain success', () => {
  it('flags an executed action whose decision never reached disk', () => {
    const outcome = classifyApproveOutcome({ success: true, persisted: false }, 'Deploy to prod');
    expect(outcome.tone).toBe('info');
    expect(outcome.message).not.toMatch(/executed successfully/i);
    expect(outcome.message).toMatch(/not written to durable storage/i);
  });

  it('reports the rolled-back UNPERSISTED outcome, not a generic block', () => {
    const outcome = classifyApproveOutcome(
      { success: false, persisted: false, outcome: 'UNPERSISTED', request: { exactAction: 'Deploy' } },
      'Deploy to prod'
    );
    expect(outcome.tone).toBe('error');
    expect(outcome.message).toMatch(/rolled back/i);
    expect(outcome.message).toMatch(/still pending/i);
  });

  it('never lets a rejected-but-unpersisted decision read as safely cancelled', () => {
    const outcome = classifyRejectOutcome({ success: true, persisted: false }, 'LinkedIn Post');
    expect(outcome.message).not.toMatch(/cancelled safely/i);
    expect(outcome.message).toMatch(/not written to durable storage/i);
  });
});

describe('AutonomousToolsModal wiring — the durability flag is read on both decisions', () => {
  const modalFlat = modalSource.replace(/\s+/g, ' ');

  it('imports and applies both classifiers', () => {
    expect(modalSource).toContain('classifyApproveOutcome');
    expect(modalSource).toContain('classifyRejectOutcome');
    expect(modalFlat).toMatch(/classifyApproveOutcome\(data, data\.request\?\.exactAction \|\| id\)/);
    expect(modalFlat).toMatch(/classifyRejectOutcome\(data, data\.request\?\.exactAction \|\| id\)/);
  });

  it('no longer claims plain success for the approval decision', () => {
    // The old resolve handler branched on `data.success` to print the banner.
    expect(modalSource).not.toMatch(/Action executed successfully/);
    expect(modalFlat).not.toMatch(/data\.success\) \{ showFeedback\( decision === 'APPROVE'/);
    expect(modalFlat).not.toMatch(/Execution blocked/);
  });

  it('renders the info tone used for an executed-but-unpersisted decision', () => {
    expect(modalFlat).toMatch(/type: 'success' \| 'error' \| 'info'/);
    expect(modalSource).toContain('bg-amber-950/90');
  });
});
