import { describe, it, expect } from 'vitest';
import {
  FINANCE_GUARD_PROBES,
  summariseFinanceGuard,
  type FinanceGuardProbeResult,
} from '../utils/financeGuardTruth';
import { runFinanceGuardSelfCheck, isFinanceBlocked } from '../../server_tools';
import { PermissionGuard } from '../utils/computerOperator/permissionGuard';

describe('financeGuardTruth — summary logic', () => {
  it('reports UNKNOWN for an empty observation set, never ENFORCED', () => {
    const report = summariseFinanceGuard([]);
    expect(report.status).toBe('UNKNOWN');
    expect(report.blockedCount).toBe(0);
  });

  it('reports GAP_DETECTED when any probe was not blocked', () => {
    const results: FinanceGuardProbeResult[] = [
      { text: 'transfer money', surface: 'intent', blocked: true },
      { text: 'buy bitcoin', surface: 'intent', blocked: false },
    ];
    const report = summariseFinanceGuard(results);
    expect(report.status).toBe('GAP_DETECTED');
    expect(report.gaps).toHaveLength(1);
    expect(report.blockedCount).toBe(1);
  });

  it('never reports ENFORCED unless every probe was observed blocked', () => {
    const results: FinanceGuardProbeResult[] = [
      { text: 'transfer money', surface: 'intent', blocked: true },
    ];
    expect(summariseFinanceGuard(results).status).toBe('ENFORCED');
  });
});

describe('finance guard — real engines refuse every probe', () => {
  it('the shared self-check observes a block for every probe', () => {
    const report = runFinanceGuardSelfCheck();
    expect(report.total).toBe(FINANCE_GUARD_PROBES.length);
    expect(report.gaps.map((g) => g.text)).toEqual([]);
    expect(report.status).toBe('ENFORCED');
    expect(report.blockedCount).toBe(FINANCE_GUARD_PROBES.length);
  });

  it('the intent filter blocks each intent-surface probe', () => {
    for (const probe of FINANCE_GUARD_PROBES.filter((p) => p.surface === 'intent')) {
      expect(isFinanceBlocked(probe.text).blocked, probe.text).toBe(true);
    }
  });

  it('the computer-operator guard permanently blocks each operator-surface probe', () => {
    for (const probe of FINANCE_GUARD_PROBES.filter((p) => p.surface === 'computer_operator')) {
      const verdict = PermissionGuard.permanentBlock({
        id: 'test',
        type: 'TERMINAL_COMMAND',
        command: probe.text,
        description: probe.text,
        securityLevel: 1,
        requiresHumanApproval: false,
      });
      expect(verdict, probe.text).not.toBeNull();
      expect(verdict?.dangerCategory).toBe('FINANCE_RESTRICTION');
    }
  });
});
