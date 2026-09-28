import { describe, it, expect } from 'vitest';
import {
  evaluatePermission,
  classifyAction,
  isBlockedByKillSwitch,
  PERMISSION_MATRIX,
} from '../utils/hardening/permissionMatrix';

describe('classifyAction', () => {
  it('classifies a destructive action', () => {
    expect(classifyAction('delete all my notes')?.category).toBe('destructive');
  });

  it('prefers the most restricted match when several apply', () => {
    // Contains both "read" (read_only) and "delete" (destructive).
    expect(classifyAction('read then delete the file')?.category).toBe('destructive');
  });

  it('classifies a read-only question', () => {
    expect(classifyAction('what is the battery status')?.category).toBe('read_only');
  });

  it('returns null for an unrecognised action', () => {
    expect(classifyAction('flibbertigibbet the widget')).toBeNull();
  });
});

describe('evaluatePermission', () => {
  it('blocks an unknown action at maximum level', () => {
    const decision = evaluatePermission('flibbertigibbet the widget', 4, 'Gaurav');
    expect(decision.allowed).toBe(false);
    expect(decision.category).toBe('unknown');
    expect(decision.requiredLevel).toBe(4);
  });

  it('allows a read-only action at level 1', () => {
    expect(evaluatePermission('check the battery status', 1).allowed).toBe(true);
  });

  it('blocks an action above the current level', () => {
    const decision = evaluatePermission('delete everything', 2, 'Gaurav');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Requires security level 4');
  });

  it('blocks an approval-required action with no approver', () => {
    const decision = evaluatePermission('send a message', 4);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('named human approval');
  });

  it('does not accept a placeholder approver', () => {
    for (const fake of ['system', 'auto', 'anonymous', 'unknown', '  ']) {
      expect(evaluatePermission('send a message', 4, fake).allowed).toBe(false);
    }
  });

  it('allows an approval-required action with a named operator', () => {
    const decision = evaluatePermission('send a message', 4, 'Gaurav');
    expect(decision.allowed).toBe(true);
    expect(decision.requiresApproval).toBe(true);
  });

  it('requires approval for every level-4 category', () => {
    for (const entry of PERMISSION_MATRIX.filter((e) => e.requiredLevel === 4)) {
      expect(entry.requiresApproval).toBe(true);
    }
  });

  it('blocks financial and credential actions at level 3', () => {
    expect(evaluatePermission('transfer 5000 rupees', 3, 'Gaurav').allowed).toBe(false);
    expect(evaluatePermission('show me the api key', 3, 'Gaurav').allowed).toBe(false);
  });
});

describe('kill switch', () => {
  it('blocks when engaged', () => {
    expect(isBlockedByKillSwitch(true)).toBe(true);
  });

  it('does not block when released', () => {
    expect(isBlockedByKillSwitch(false)).toBe(false);
  });
});