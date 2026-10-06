import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ApprovalQueue, classifyApprovalDecision } from '../utils/github/approvalQueue';

// Regression guard for backlog item 13. `POST /api/github/approvals/:id/decision`
// answered `{ success: true, approval }` for every id that existed, including one
// already APPROVED, REJECTED or EXPIRED. A duplicate or late click therefore
// re-reported a success it did not produce and wrote an audit entry as though a
// human had just decided. server.ts binds a port on import, so the wiring is
// asserted against the source text and the decision logic is exercised directly,
// matching approvalCreateTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

function decisionRouteSource(): string {
  const start = serverSource.indexOf("app.post('/api/github/approvals/:id/decision'");
  const end = serverSource.indexOf("app.get('/api/github/nightly'", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return serverSource.slice(start, end);
}

describe('classifyApprovalDecision claims success only for a real state transition', () => {
  it('reports success when a PENDING request was decided', () => {
    const verdict = classifyApprovalDecision('PENDING', 'APPROVED');
    expect(verdict.success).toBe(true);
    expect(verdict.recorded).toBe(true);
    expect(verdict.outcome).toBe('DECIDED');
  });

  it('reports a no-op for an already-settled request, not success', () => {
    const verdict = classifyApprovalDecision('APPROVED', 'APPROVED');
    expect(verdict.success).toBe(false);
    expect(verdict.recorded).toBe(false);
    expect(verdict.outcome).toBe('ALREADY_SETTLED');
    expect(verdict.message).toContain('already');
  });

  it('reports a no-op for an expired request, not success', () => {
    const verdict = classifyApprovalDecision('EXPIRED', 'EXPIRED');
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('ALREADY_SETTLED');
  });

  it('reports NOT_FOUND when the id does not exist', () => {
    const verdict = classifyApprovalDecision(null, null);
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('NOT_FOUND');
  });
});

describe('ApprovalQueue state transitions back classifyApprovalDecision', () => {
  const makeQueue = () =>
    new ApprovalQueue({ ttlMs: 60_000, now: () => new Date('2026-10-05T00:00:00Z') });

  function request(queue: ApprovalQueue) {
    return queue.request({
      actionId: 'step-1',
      summary: 'Fix the failing lint check',
      summaryHi: 'x',
      risk: 'MEDIUM',
      files: ['server.ts'],
      targetBranch: 'feature/fix',
    }).approval;
  }

  it('a first decision is recorded; a second on the same id is a no-op', () => {
    const queue = makeQueue();
    const approval = request(queue);

    const before = queue.get(approval.id)?.state ?? null;
    const first = queue.decide(approval.id, true, 'Mr. Gahonsh');
    expect(classifyApprovalDecision(before, first?.state ?? null).outcome).toBe('DECIDED');

    const beforeSecond = queue.get(approval.id)?.state ?? null;
    const second = queue.decide(approval.id, false, 'Mr. Gahonsh');
    const verdict = classifyApprovalDecision(beforeSecond, second?.state ?? null);
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('ALREADY_SETTLED');
    // The record is untouched by the second attempt.
    expect(second?.state).toBe('APPROVED');
  });

  it('an unknown id resolves to NOT_FOUND without a record', () => {
    const queue = makeQueue();
    const before = queue.get('missing')?.state ?? null;
    const updated = queue.decide('missing', true, 'Mr. Gahonsh');
    expect(classifyApprovalDecision(before, updated?.state ?? null).outcome).toBe('NOT_FOUND');
  });
});

describe('POST /api/github/approvals/:id/decision wiring (source guard)', () => {
  it('classifies the decision instead of answering a blanket success', () => {
    const route = decisionRouteSource();
    expect(route).toContain('classifyApprovalDecision(');
    // The old unconditional success reply must be gone.
    expect(route).not.toContain('res.json({ success: true, approval: updated })');
  });

  it('does not write the audit entry when no decision was recorded', () => {
    const route = decisionRouteSource();
    expect(route).toContain('if (!verdict.recorded)');
    // The audit write sits after the recorded guard, so a no-op returns first.
    expect(route.indexOf('if (!verdict.recorded)')).toBeLessThan(route.indexOf('addAuditLog('));
  });
});
