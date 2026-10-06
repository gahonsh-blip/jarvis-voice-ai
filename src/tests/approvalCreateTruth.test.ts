import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyApprovalCreate } from '../utils/hardening/approvalCreateTruth';

// Regression guard for backlog item 13. `POST /api/approvals/create` answered
// `{ success: true, request }` for any request that matched a stored record,
// including one the finance guard or the emergency stop had blocked. server.ts
// binds a port on import, so the wiring is asserted against the source text and
// the decision logic is exercised directly, matching bridgeEventTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

function approvalCreateRouteSource(): string {
  const start = serverSource.indexOf("app.post('/api/approvals/create'");
  const end = serverSource.indexOf("app.post('/api/approvals/resolve'", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return serverSource.slice(start, end);
}

describe('classifyApprovalCreate reports staging only when a request is actually pending', () => {
  it('reports success only for a request that reached PENDING_APPROVAL', () => {
    const verdict = classifyApprovalCreate({ request: { status: 'PENDING_APPROVAL' } });
    expect(verdict.success).toBe(true);
    expect(verdict.staged).toBe(true);
    expect(verdict.outcome).toBe('PENDING_APPROVAL');
  });

  it('never reports success for a finance-blocked request', () => {
    const verdict = classifyApprovalCreate({
      blockedByFinance: true,
      financeReason: 'Blocked: financial operation detected.',
      request: { status: 'REJECTED' },
    });
    expect(verdict.success).toBe(false);
    expect(verdict.staged).toBe(false);
    expect(verdict.outcome).toBe('BLOCKED_FINANCE');
    expect(verdict.message).toContain('financial operation');
  });

  it('never reports success for an emergency-stop-blocked request', () => {
    const verdict = classifyApprovalCreate({
      blockedByEmergency: true,
      request: { status: 'BLOCKED_EMERGENCY_STOP' },
    });
    expect(verdict.success).toBe(false);
    expect(verdict.staged).toBe(false);
    expect(verdict.outcome).toBe('BLOCKED_EMERGENCY');
  });

  it('treats any non-pending request status as not staged', () => {
    const verdict = classifyApprovalCreate({ request: { status: 'FAILED' } });
    expect(verdict.success).toBe(false);
    expect(verdict.staged).toBe(false);
    expect(verdict.outcome).toBe('NOT_STAGED');
  });

  it('treats a missing request as not staged', () => {
    const verdict = classifyApprovalCreate({});
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('NOT_STAGED');
  });
});

describe('POST /api/approvals/create wiring (source guard)', () => {
  it('classifies the created request instead of answering a blanket success', () => {
    const route = approvalCreateRouteSource();
    expect(route).toContain('classifyApprovalCreate(result)');
    // The old unconditional success reply must be gone.
    expect(route).not.toContain("res.json({ success: true, request: result.request })");
  });

  it('gates the success reply behind a staged verdict', () => {
    const route = approvalCreateRouteSource();
    expect(route).toContain('if (!verdict.staged)');
    expect(route).toContain('success: true, staged: true');
  });
});
