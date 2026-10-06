// ==============================================================================
// Approval registry terminal-state truth guard (backlog item 13).
//
// `updateActionRequestStatus` is the shared source of truth every approval
// surface writes through (web `/api/approvals/resolve`, the Telegram
// `approve_perm_` / `reject_perm_` buttons, the telephony gateway). It used to
// accept any transition: a request that had already been REJECTED or EXECUTED
// could be re-stamped by a second tap, and the caller reported a fresh success
// for a decision the human had already made. These tests pin the terminal-state
// guard and the source wiring that relies on it.
// ==============================================================================
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  canTransitionActionStatus,
  createPendingActionRequest,
  updateActionRequestStatus,
} from '../../server_tools';

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

function newPendingRequest() {
  const { request } = createPendingActionRequest({
    exactAction: 'Publish LinkedIn post',
    target: 'linkedin.com/feed',
    contentChanges: 'New post body',
    source: 'web_terminal',
  });
  expect(request.status).toBe('PENDING_APPROVAL');
  return request;
}

describe('canTransitionActionStatus — a decision is terminal', () => {
  it('allows the first decision on a pending request', () => {
    expect(canTransitionActionStatus('PENDING_APPROVAL', 'EXECUTED')).toBe(true);
    expect(canTransitionActionStatus('PENDING_APPROVAL', 'REJECTED')).toBe(true);
    expect(canTransitionActionStatus('PENDING_APPROVAL', 'FAILED')).toBe(true);
  });

  it('refuses to move out of every terminal status', () => {
    for (const status of ['REJECTED', 'EXECUTED', 'FAILED', 'BLOCKED_EMERGENCY_STOP'] as const) {
      expect(canTransitionActionStatus(status, 'EXECUTED')).toBe(false);
      expect(canTransitionActionStatus(status, 'REJECTED')).toBe(false);
      expect(canTransitionActionStatus(status, 'APPROVED')).toBe(false);
    }
  });
});

describe('updateActionRequestStatus refuses to re-decide', () => {
  it('resolves a pending request once', () => {
    const req = newPendingRequest();
    const first = updateActionRequestStatus(req.id, 'EXECUTED', { resolvedBy: 'HUMAN' });
    expect(first).not.toBeNull();
    expect(first?.status).toBe('EXECUTED');
    expect(first?.resolvedBy).toBe('HUMAN');
  });

  it('returns null on a second decision instead of re-stamping the request', () => {
    const req = newPendingRequest();
    updateActionRequestStatus(req.id, 'EXECUTED', { resolvedBy: 'HUMAN' });

    // A late/duplicate tap must not flip the recorded outcome.
    const second = updateActionRequestStatus(req.id, 'REJECTED', { resolvedBy: 'HUMAN' });
    expect(second).toBeNull();

    const third = updateActionRequestStatus(req.id, 'EXECUTED', { resolvedBy: 'HUMAN' });
    expect(third).toBeNull();
  });

  it('does not overwrite a rejected request with an approval', () => {
    const req = newPendingRequest();
    updateActionRequestStatus(req.id, 'REJECTED', { resolvedBy: 'HUMAN' });
    expect(updateActionRequestStatus(req.id, 'EXECUTED', { resolvedBy: 'HUMAN' })).toBeNull();
  });

  it('still returns null for an unknown id', () => {
    expect(updateActionRequestStatus('no-such-action-xyz', 'REJECTED')).toBeNull();
  });
});

describe('server.ts wires the guard into the approval surfaces', () => {
  it('imports the shared transition predicate', () => {
    expect(serverSource).toContain('canTransitionActionStatus,');
  });

  it('guards the web approve-and-execute branch against re-dispatch', () => {
    const routeStart = serverSource.indexOf("app.post('/api/approvals/resolve'");
    expect(routeStart).toBeGreaterThan(-1);
    const branch = serverSource.slice(routeStart, routeStart + 4000);
    expect(branch).toContain("canTransitionActionStatus(targetReq.status, 'EXECUTED')");
    expect(branch).toContain('status(409)');
  });

  it('does not claim a rejection when the Telegram re-tap changed nothing', () => {
    const branchStart = serverSource.indexOf("data.startsWith('reject_perm_')");
    expect(branchStart).toBeGreaterThan(-1);
    const branch = serverSource.slice(branchStart, branchStart + 900);
    expect(branch).toContain('updated\n      ?');
    expect(branch).toContain('was already processed or expired');
  });
});
