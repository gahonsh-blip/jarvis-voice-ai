import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyOutboundStage } from '../utils/hardening/outboundStageTruth';
import {
  createPendingActionRequest,
  activateEmergencyKillSwitch,
  resumeSystemOperation,
  getEmergencyState,
} from '../../server_tools';

// Zero-fake-success guard for `POST /api/telephony/outbound/stage`.
//
// The route answered `{ success: true, request, actionId, promptText }` for
// every request. It discarded the result of `createPendingActionRequest`, so a
// finance-guard block or an active emergency stop still reported a staged
// Level-4 outbound call and returned an `actionId` for a request that could
// never be authorized. It also staged a pending outbound request *before* the
// safety check, leaving a blocked dial in the pending queue. Success must be
// claimed only when the action genuinely reached `PENDING_APPROVAL`.
//
// server.ts binds a port on import, so the wiring is asserted against the
// source text and the decision logic is exercised directly, matching
// approvalCreateTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

function outboundStageRouteSource(): string {
  const start = serverSource.indexOf("app.post('/api/telephony/outbound/stage'");
  const end = serverSource.indexOf("app.post('/api/telephony/outbound/authorize'", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return serverSource.slice(start, end);
}

describe('classifyOutboundStage reports staging only when an action is actually pending', () => {
  it('reports success only for a request that reached PENDING_APPROVAL', () => {
    const verdict = classifyOutboundStage({ request: { status: 'PENDING_APPROVAL' } });
    expect(verdict.success).toBe(true);
    expect(verdict.staged).toBe(true);
    expect(verdict.outcome).toBe('STAGED');
  });

  it('never reports success for a finance-blocked request', () => {
    const verdict = classifyOutboundStage({
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
    const verdict = classifyOutboundStage({
      blockedByEmergency: true,
      request: { status: 'BLOCKED_EMERGENCY_STOP' },
    });
    expect(verdict.success).toBe(false);
    expect(verdict.staged).toBe(false);
    expect(verdict.outcome).toBe('BLOCKED_EMERGENCY');
  });

  it('treats any non-pending request status as not staged', () => {
    const verdict = classifyOutboundStage({ request: { status: 'FAILED' } });
    expect(verdict.success).toBe(false);
    expect(verdict.staged).toBe(false);
    expect(verdict.outcome).toBe('NOT_STAGED');
  });

  it('treats a missing request as not staged', () => {
    const verdict = classifyOutboundStage({});
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('NOT_STAGED');
  });
});

describe('createPendingActionRequest drives the stage verdict for real inputs', () => {
  afterEach(() => {
    resumeSystemOperation('TEST_CLEANUP');
  });

  it('a benign outbound call reaches PENDING_APPROVAL and stages', () => {
    const result = createPendingActionRequest({
      exactAction: 'Outbound PSTN Call to +91 ••••• •3210',
      target: '+91 ••••• •3210',
      contentChanges: 'Purpose: confirm a dentist appointment',
      level: 4,
      source: 'Telephony Gateway',
    });
    const verdict = classifyOutboundStage(result);
    expect(verdict.success).toBe(true);
    expect(verdict.outcome).toBe('STAGED');
    expect(result.request.status).toBe('PENDING_APPROVAL');
  });

  it('a finance-flavoured outbound call is blocked and never staged', () => {
    const result = createPendingActionRequest({
      exactAction: 'Outbound PSTN Call to +91 ••••• •3210',
      target: '+91 ••••• •3210',
      contentChanges: 'Purpose: transfer money to the vendor UPI',
      level: 4,
      source: 'Telephony Gateway',
    });
    const verdict = classifyOutboundStage(result);
    expect(result.blockedByFinance).toBe(true);
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('BLOCKED_FINANCE');
  });

  it('an emergency stop blocks the outbound call and never stages', () => {
    activateEmergencyKillSwitch('TEST', 'unit test');
    const result = createPendingActionRequest({
      exactAction: 'Outbound PSTN Call to +91 ••••• •3210',
      target: '+91 ••••• •3210',
      contentChanges: 'Purpose: confirm a dentist appointment',
      level: 4,
      source: 'Telephony Gateway',
    });
    const verdict = classifyOutboundStage(result);
    expect(result.blockedByEmergency).toBe(true);
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('BLOCKED_EMERGENCY');
    expect(getEmergencyState().emergencyPaused).toBe(true);
  });
});

describe('POST /api/telephony/outbound/stage wiring (source guard)', () => {
  it('classifies the safety-gate result instead of answering a blanket success', () => {
    const route = outboundStageRouteSource();
    expect(route).toContain('classifyOutboundStage(actionReq)');
    expect(route).toContain('if (!verdict.success)');
  });

  it('runs the safety gate before staging a pending outbound request', () => {
    const route = outboundStageRouteSource();
    const gateIndex = route.indexOf('createPendingActionRequest(');
    const stageIndex = route.indexOf('stageOutboundRequest(');
    expect(gateIndex).toBeGreaterThan(-1);
    expect(stageIndex).toBeGreaterThan(-1);
    // The blocked path must never reach the session-manager staging call.
    expect(gateIndex).toBeLessThan(stageIndex);
  });

  it('returns no actionable id when the action was blocked', () => {
    const route = outboundStageRouteSource();
    expect(route).toContain('actionId: null');
  });

  it('no longer answers a blanket success:true for the staged request', () => {
    const route = outboundStageRouteSource();
    expect(route).not.toContain('success: true,\n      request,\n      actionId: actionReq.request.id,');
  });
});
