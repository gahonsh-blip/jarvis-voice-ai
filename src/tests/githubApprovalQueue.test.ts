// ==============================================================================
// Tests for the human approval queue (items 20 and 44).
//
// An approval is the gate in front of every external or irreversible action, so
// the properties proven here matter: nothing approves itself, an expired request
// is treated as denied, and a decision must carry a human's name.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { ApprovalQueue } from '../utils/github/approvalQueue';

function request(queue: ApprovalQueue, overrides: Record<string, unknown> = {}) {
  return queue.request({
    actionId: 'step-1',
    summary: 'Fix the failing lint check',
    summaryHi: 'x',
    risk: 'MEDIUM',
    files: ['server.ts'],
    targetBranch: 'feature/fix',
    ...overrides,
  } as Parameters<ApprovalQueue['request']>[0]);
}

describe('ApprovalQueue', () => {
  it('starts a request in the PENDING state', () => {
    const queue = new ApprovalQueue();
    const { approval } = request(queue);
    expect(approval.state).toBe('PENDING');
    expect(queue.listPending()).toHaveLength(1);
  });

  it('resolves as approved when a named human approves', async () => {
    const queue = new ApprovalQueue();
    const { approval, decision } = request(queue);

    const updated = queue.decide(approval.id, true, 'Mr. Gahonsh');
    expect(updated?.state).toBe('APPROVED');
    expect(updated?.decidedBy).toBe('Mr. Gahonsh');

    await expect(decision).resolves.toEqual({
      approved: true,
      approvedBy: 'Mr. Gahonsh',
      reason: undefined,
    });
    expect(queue.listPending()).toHaveLength(0);
  });

  it('resolves as denied when the human rejects', async () => {
    const queue = new ApprovalQueue();
    const { approval, decision } = request(queue);

    queue.decide(approval.id, false, 'Mr. Gahonsh', 'not needed');
    const result = await decision;
    expect(result.approved).toBe(false);
    expect(result.reason).toBe('not needed');
  });

  it('treats an expired request as denied, never as an implicit yes', async () => {
    const queue = new ApprovalQueue({ ttlMs: 40 });
    const { approval, decision } = request(queue);

    const result = await decision;
    expect(result.approved).toBe(false);
    expect(result.approvedBy).toBe('NONE');
    expect(result.reason).toContain('expired');
    expect(queue.get(approval.id)?.state).toBe('EXPIRED');
  });

  it('ignores a decision that arrives after expiry', async () => {
    const queue = new ApprovalQueue({ ttlMs: 30 });
    const { approval, decision } = request(queue);

    await decision;
    const late = queue.decide(approval.id, true, 'Late Human');
    // The record stays EXPIRED; a late approval cannot revive it.
    expect(late?.state).toBe('EXPIRED');
  });

  it('returns null for an unknown approval id', () => {
    const queue = new ApprovalQueue();
    expect(queue.decide('does-not-exist', true, 'x')).toBeNull();
  });

  it('ignores a second decision on an already-settled request', async () => {
    const queue = new ApprovalQueue();
    const { approval, decision } = request(queue);

    queue.decide(approval.id, true, 'First');
    const second = queue.decide(approval.id, false, 'Second');

    expect(second?.state).toBe('APPROVED');
    expect(second?.decidedBy).toBe('First');
    await expect(decision).resolves.toMatchObject({ approved: true, approvedBy: 'First' });
  });

  it('keeps a history of settled requests', () => {
    const queue = new ApprovalQueue();
    const a = request(queue, { actionId: 'a' }).approval;
    const b = request(queue, { actionId: 'b' }).approval;
    queue.decide(a.id, true, 'Human');
    queue.decide(b.id, false, 'Human');

    expect(queue.listPending()).toHaveLength(0);
    expect(queue.list()).toHaveLength(2);
  });

  it('prunes settled records but keeps pending ones', () => {
    const queue = new ApprovalQueue();
    for (let i = 0; i < 5; i++) {
      const { approval } = request(queue, { actionId: `a${i}` });
      queue.decide(approval.id, true, 'Human');
    }
    const pending = request(queue, { actionId: 'keep' }).approval;

    queue.prune(2);
    expect(queue.get(pending.id)?.state).toBe('PENDING');
    expect(queue.list().length).toBeLessThanOrEqual(3);
  });
});