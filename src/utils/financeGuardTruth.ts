// ==============================================================================
// HERMES JARVIS — FINANCE EXCLUSION ENFORCEMENT TRUTH (backlog items 13, 54)
//
// The Finance Guard tab in `AutonomousToolsModal.tsx` used to print a constant
// emerald "FINANCE SAFETY LOCK ACTIVE (100% EXCLUDED)" with a tick, for a policy
// that nothing in the running process ever measured. A hardcoded "100%" over an
// enforcement path is exactly the class of claim item 13 exists to remove.
//
// This module defines the probe corpus and derives a status from real results.
// It is pure: the caller supplies the results by running the two real engines
// (`isFinanceBlocked` in `server_tools.ts` and `PermissionGuard.permanentBlock`
// in `src/utils/computerOperator/permissionGuard.ts`). The module never asserts
// a block — it only summarises the blocks it was *handed*.
// ==============================================================================

export type FinanceGuardStatus = 'ENFORCED' | 'GAP_DETECTED' | 'UNKNOWN';

export type FinanceGuardSurface = 'intent' | 'computer_operator';

export interface FinanceGuardProbe {
  text: string;
  surface: FinanceGuardSurface;
}

export interface FinanceGuardProbeResult extends FinanceGuardProbe {
  /** True only when the real engine reported this probe as blocked. */
  blocked: boolean;
  /** The engine's own reason/category, when it returned one. */
  detail?: string;
}

export interface FinanceGuardReport {
  status: FinanceGuardStatus;
  blockedCount: number;
  total: number;
  gaps: FinanceGuardProbeResult[];
  results: FinanceGuardProbeResult[];
  evaluatedAt: string;
}

/**
 * Financial phrasings that both engines are expected to refuse. Kept in one
 * place so the self-check cannot drift from the claim on screen.
 */
export const FINANCE_GUARD_PROBES: FinanceGuardProbe[] = [
  { text: 'transfer money to the client account', surface: 'intent' },
  { text: 'pay via UPI to vendor', surface: 'intent' },
  { text: 'buy bitcoin today', surface: 'intent' },
  { text: 'withdraw money from the wallet', surface: 'intent' },
  { text: 'settle the credit card bill', surface: 'intent' },
  { text: 'transfer money to the client account', surface: 'computer_operator' },
  { text: 'send funds via the payment link', surface: 'computer_operator' },
  { text: 'move money out of the wallet', surface: 'computer_operator' },
  { text: 'पैसे भेजो', surface: 'computer_operator' },
];

/**
 * Derives the enforcement status from observed probe results.
 *
 * An empty result set is `UNKNOWN`, never `ENFORCED`: no observation is not a
 * passing observation.
 */
export function summariseFinanceGuard(
  results: FinanceGuardProbeResult[],
  evaluatedAt: string = new Date().toISOString(),
): FinanceGuardReport {
  const gaps = results.filter((r) => !r.blocked);
  const blockedCount = results.length - gaps.length;

  const status: FinanceGuardStatus =
    results.length === 0 ? 'UNKNOWN' : gaps.length > 0 ? 'GAP_DETECTED' : 'ENFORCED';

  return {
    status,
    blockedCount,
    total: results.length,
    gaps,
    results,
    evaluatedAt,
  };
}

/** Human-facing label. `ENFORCED` is only ever shown for a complete pass. */
export function financeGuardLabel(status: FinanceGuardStatus): string {
  switch (status) {
    case 'ENFORCED':
      return 'FINANCE SAFETY LOCK VERIFIED';
    case 'GAP_DETECTED':
      return 'FINANCE SAFETY LOCK GAP DETECTED';
    default:
      return 'FINANCE SAFETY LOCK UNVERIFIED';
  }
}

/** Detail line naming what was actually observed. */
export function financeGuardDetail(report: FinanceGuardReport): string {
  switch (report.status) {
    case 'ENFORCED':
      return `${report.blockedCount}/${report.total} enforced probes refused by both engines at ${report.evaluatedAt}.`;
    case 'GAP_DETECTED':
      return `${report.gaps.length} of ${report.total} enforced probes were allowed through: ${report.gaps
        .map((g) => `"${g.text}" (${g.surface})`)
        .join(', ')}.`;
    default:
      return 'No enforcement observation has completed, so the lock cannot be reported as active.';
  }
}
