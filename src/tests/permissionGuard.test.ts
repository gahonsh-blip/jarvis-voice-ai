import { describe, it, expect } from 'vitest';
import { PermissionGuard } from '../utils/computerOperator/permissionGuard';
import type { ComputerAction } from '../types/computerOperator';

function makeAction(overrides: Partial<ComputerAction> = {}): ComputerAction {
  return {
    id: 'act-1',
    type: 'CLICK',
    description: 'Click the OK button',
    securityLevel: 1,
    requiresHumanApproval: false,
    ...overrides,
  };
}

describe('PermissionGuard — emergency stop', () => {
  it('blocks every action while the global emergency stop is active', () => {
    const result = PermissionGuard.evaluateAction(makeAction(), true);
    expect(result.allowed).toBe(false);
    expect(result.blockReason).toMatch(/Emergency Stop/i);
  });
});

describe('PermissionGuard — finance exclusion', () => {
  it('permanently blocks financial operations regardless of security level', () => {
    const result = PermissionGuard.evaluateAction(
      makeAction({ description: 'send money to savings account', securityLevel: 1 }),
    );
    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.dangerCategory).toBe('FINANCE_RESTRICTION');
  });
});

describe('PermissionGuard — destructive command guard', () => {
  it('blocks rm -rf and requires human approval', () => {
    const result = PermissionGuard.evaluateAction(
      makeAction({ type: 'TERMINAL_COMMAND', command: 'rm -rf /var/data', description: 'cleanup' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.dangerCategory).toBe('DESTRUCTIVE_SYSTEM_COMMAND');
  });
});

describe('PermissionGuard — security bypass guard', () => {
  it('blocks captcha solving without offering an approval path', () => {
    const result = PermissionGuard.evaluateAction(
      makeAction({ description: 'solve the captcha on the login page' }),
    );
    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.dangerCategory).toBe('SECURITY_BYPASS_ATTEMPT');
  });
});

describe('PermissionGuard — Level 4 human gate', () => {
  it('requires explicit human approval for level-4 actions', () => {
    const result = PermissionGuard.evaluateAction(makeAction({ securityLevel: 4 }));
    expect(result.allowed).toBe(false);
    expect(result.requiresHumanApproval).toBe(true);
    expect(result.dangerCategory).toBe('LEVEL_4_HUMAN_GATE');
  });

  it('gates publishing and broadcasting behind approval even at a low level', () => {
    expect(
      PermissionGuard.evaluateAction(makeAction({ description: 'publish the release notes' })).requiresHumanApproval,
    ).toBe(true);
    expect(
      PermissionGuard.evaluateAction(makeAction({ description: 'broadcast to all clients' })).requiresHumanApproval,
    ).toBe(true);
  });
});

describe('PermissionGuard — safe local actions', () => {
  it('allows level-3 local workspace edits without approval', () => {
    const result = PermissionGuard.evaluateAction(makeAction({ type: 'EDIT_FILE', securityLevel: 3 }));
    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
    expect(result.securityLevel).toBe(3);
  });

  it('allows read-only inspection actions', () => {
    const result = PermissionGuard.evaluateAction(makeAction({ type: 'INSPECT_SCREEN', securityLevel: 1 }));
    expect(result.allowed).toBe(true);
    expect(result.requiresHumanApproval).toBe(false);
  });
});

describe('PermissionGuard — isApprovalRequired helper', () => {
  it('mirrors evaluateAction approval requirement', () => {
    expect(PermissionGuard.isApprovalRequired(makeAction({ securityLevel: 4 }))).toBe(true);
    expect(PermissionGuard.isApprovalRequired(makeAction({ type: 'INSPECT_SCREEN', securityLevel: 1 }))).toBe(false);
  });
});