// ==============================================================================
// HERMES JARVIS — FINANCE EXCLUSION & PERMISSION ACTION REQUEST TESTS
// Covers the autonomous-action gate used by the live approval path in
// server_tools.ts: the strict finance exclusion filter and the
// human-in-the-loop action request lifecycle (finance block, emergency-stop
// block, and the normal PENDING_APPROVAL path).
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  isFinanceBlocked,
  createPendingActionRequest,
  getPendingApprovals,
  toggleEmergencyStop,
  resumeSystemOperation,
} from '../../server_tools';

describe('isFinanceBlocked (strict finance exclusion filter)', () => {
  it.each([
    'transfer money to the client',
    'pay via UPI to vendor',
    'send money to account',
    'buy bitcoin today',
    'settle the credit card bill',
    'withdraw money from the wallet',
    'fund transfer of rupees',
  ])('blocks autonomous financial intent: %s', (text) => {
    const result = isFinanceBlocked(text);
    expect(result.blocked).toBe(true);
    expect(result.reason).toMatch(/financial operation/i);
  });

  it('does not block ordinary non-financial text', () => {
    expect(isFinanceBlocked('update the workspace README and run tests').blocked).toBe(false);
  });

  it('does not block an empty string', () => {
    expect(isFinanceBlocked('').blocked).toBe(false);
  });
});

describe('createPendingActionRequest (Level 3/4 human-in-the-loop gate)', () => {
  beforeEach(() => {
    // Ensure a clean state before each case.
    resumeSystemOperation('test-setup');
  });

  it('creates a PENDING_APPROVAL request for a normal external action', () => {
    const { request } = createPendingActionRequest({
      exactAction: 'Publish blog post',
      target: 'company blog',
      contentChanges: 'new article body',
      level: 4,
    });
    expect(request.status).toBe('PENDING_APPROVAL');
    expect(request.level).toBe(4);
    expect(getPendingApprovals().some((r) => r.id === request.id)).toBe(true);
  });

  it('rejects a finance action before it can ever be approved', () => {
    const { request, blockedByFinance } = createPendingActionRequest({
      exactAction: 'Send money to freelancer',
      target: 'UPI',
      contentChanges: 'amount 5000',
      level: 4,
    });
    expect(blockedByFinance).toBe(true);
    expect(request.status).toBe('REJECTED');
    expect(getPendingApprovals().some((r) => r.id === request.id)).toBe(false);
  });

  it('blocks every new action while the emergency stop is active', () => {
    toggleEmergencyStop('test-operator', 'testing emergency freeze');
    try {
      const { request, blockedByEmergency } = createPendingActionRequest({
        exactAction: 'Publish blog post',
        target: 'company blog',
        contentChanges: 'new article body',
        level: 4,
      });
      expect(blockedByEmergency).toBe(true);
      expect(request.status).toBe('BLOCKED_EMERGENCY_STOP');
    } finally {
      resumeSystemOperation('test-teardown');
    }
  });

  it('defaults a Level 3 request to the MODIFY permission label', () => {
    const { request } = createPendingActionRequest({
      exactAction: 'Edit workspace file',
      target: 'src/config.ts',
      contentChanges: 'tweak value',
      level: 3,
    });
    expect(request.level).toBe(3);
    expect(request.requiredPermission).toBe('LEVEL 3 MODIFY');
  });
});
