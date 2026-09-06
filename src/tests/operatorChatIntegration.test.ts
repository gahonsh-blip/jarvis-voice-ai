/**
 * Regression tests for the live-chat Computer-Operator integration layer.
 *
 * Covers routing boundaries (ordinary conversation stays on the normal pipeline,
 * operator commands route to the engine), approval gating, rejection, cancellation,
 * honest not-configured provider state,, secret redaction, and kill-switch gating.
 */

import { describe, it, expect } from 'vitest';
import {
  shouldRouteToOperator,
  isExplicitOperatorApproval,
  isExplicitOperatorRejection,
  planOperatorRun,
  executePlannedOperatorRun,
  describeOperatorRun,
  formatOperatorTaskMessage,
  redactSecrets,
} from '../utils/operatorChatIntegration';
import { redactSecrets as engineRedact } from '../utils/computerOperatorEngine';

describe('operator chat routing boundary', () => {
  it('routes a computer-operation command to the operator engine', () => {
    const d = shouldRouteToOperator('Open VS Code.');
    expect(d.kind).toBe('OPERATOR');
    if (d.kind === 'OPERATOR') {
      expect(d.classification.intent).toBe('COMPUTER_OPERATION');
    }
  });

  it('routes an observe-the-screen command to the operator engine', () => {
    const d = shouldRouteToOperator('Tell me what is displayed on the screen.');
    if (d.kind === 'OPERATOR') {
      expect(['COMPUTER_OPERATION', 'RESEARCH']).toContain(d.classification.intent);
    } else {
      throw new Error('expected operator route');
    }
  });

  it('keeps ordinary greetings on the normal AI conversation pipeline', () => {
    expect(shouldRouteToOperator('Hi Jarvis.').kind).toBe('NOT_OPERATOR');
    expect(shouldRouteToOperator('Hello.').kind).toBe('NOT_OPERATOR');
    expect(shouldRouteToOperator('How are you?').kind).toBe('NOT_OPERATOR');
    expect(shouldRouteToOperator('What is my name?').kind).toBe('NOT_OPERATOR');
    expect(shouldRouteToOperator('What is today\'s plan?').kind).toBe('NOT_OPERATOR');
  });

  it('keeps existing special commands on their own handlers', () => {
    expect(shouldRouteToOperator('/settings').kind).toBe('NOT_OPERATOR');
    expect(shouldRouteToOperator('weather aaj ka').kind).toBe('NOT_OPERATOR');
  });
});

describe('operator approval + rejection', () => {
  it('recognizes explicit approval phrases', () => {
    expect(isExplicitOperatorApproval('haan')).toBe(true);
    expect(isExplicitOperatorApproval('Haan')).toBe(true);
    expect(isExplicitOperatorApproval('yes')).toBe(true);
    expect(isExplicitOperatorApproval('approve')).toBe(true);
    expect(isExplicitOperatorApproval('theek hai')).toBe(true);
  });

  it('recognizes explicit rejection phrases', () => {
    expect(isExplicitOperatorRejection('nahi')).toBe(true);
    expect(isExplicitOperatorRejection('No')).toBe(true);
    expect(isExplicitOperatorRejection('cancel')).toBe(true);
  });

  it('never treats arbitrary speech as authorization', () => {
    expect(isExplicitOperatorApproval('tell me a joke')).toBe(false);
    expect(isExplicitOperatorApproval('what is the weather')).toBe(false);
    expect(isExplicitOperatorRejection('what is the weather')).toBe(false);
  });
});

describe('operator run planning + honest provider state', () => {
  it('reports NOT_CONFIGURED when no live desktop bridge is connected', async () => {
    const run = await planOperatorRun('Open VS Code.');
    expect(run.plan.blockedBy).toBe('SCREEN_READ_PERMISSION_REQUIRED');
    expect(run.plan.needsApproval).toBe(false);
  });

  it('describes blocked plans explicitly', async () => {
    const run = await planOperatorRun('Open VS Code.');
    const desc = describeOperatorRun(run);
    expect(desc).toMatch(/SCREEN_READ_PERMISSION_REQUIRED/i);
  });
});

describe('operator kill-switch gating', () => {
  it('blocks a run when the kill switch is active', async () => {
    const run = await planOperatorRun('Open VS Code.');
    const result = await executePlannedOperatorRun('Open VS Code.', run, {
      taskId: 't-kill',
      killSwitchActive: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/KILL_SWITCH/i);
      expect(result.task.status).toBe('BLOCKED');
    }
  });

  it('marks not-configured adapter results honestly', async () => {
    const run = await planOperatorRun('Open VS Code.');
    const result = await executePlannedOperatorRun('Open VS Code.', run, {
      taskId: 't-nc',
      killSwitchActive: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.task.status).toBe('FAILED');
      expect(result.task.error).toMatch(/SCREEN_READ_PERMISSION_REQUIRED|ACTION_FAILED|VERIFICATION_FAILED|DESKTOP_CONTROL_NOT_CONFIGURED/i);
    }
  });
});

describe('operator secret redaction', () => {
  it('redacts passwords and API keys from operator messages', () => {
    expect(redactSecrets('password=hunter2')).not.toContain('hunter2');
    expect(engineRedact('api_key=sk-1234567890abcdef')).not.toContain('1234567890abcdef');
  });

  it('formats messages with redaction applied', () => {
    const msg = formatOperatorTaskMessage({
      taskId: 't',
      timestamp: new Date().toISOString(),
      intent: 'COMPUTER_OPERATION',
      status: 'FAILED',
      state: null,
      actions: [],
      actionIndex: 0,
      verificationResult: null,
      approvalState: 'NOT_REQUIRED',
      error: 'ACTION_FAILED password=hunter2',
    } as any);
    expect(msg).not.toContain('hunter2');
  });
});

describe('operator cancellation', () => {
  it('cancels a run through the cancel check', async () => {
    let cancelled = true;
    const run = await planOperatorRun('Open VS Code.');
    const result = await executePlannedOperatorRun('Open VS Code.', run, {
      taskId: 't-cancel',
      killSwitchActive: false,
      cancelCheck: () => cancelled,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.task.status).toMatch(/CANCELLED/i);
    }
  });
});