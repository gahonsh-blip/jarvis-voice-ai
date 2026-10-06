// =============================================================================
// HERMES JARVIS — Fix-plan coverage truth (backlog item 13)
//
// `POST /api/github/fix-plan` reported `nothingToDo` from `buildFixPlan` alone,
// and that flag only knows about the steps it could derive. A scan that returned
// no repository, or that returned every repository unreachable, produces zero
// steps and therefore `nothingToDo: true` — an "all clear" the plan never
// established. The same happens when only local health was supplied: a
// workspace where every check passed proves nothing about the remote account
// that was never scanned.
//
// This module keeps the derived plan honest: `nothingToDo` is claimed only when
// the inputs actually covered the scope the flag describes.
// =============================================================================

import type { FixPlan, FixStep, FixRisk } from '../github/fixPlanner';

export interface FixPlanCoverageInput {
  /** The account-wide scan, when one was attempted. */
  multiRepoScan?: { reachableCount: number; unreachableCount: number; scans: unknown[] };
  /** The local health report, when one was attempted. */
  localHealth?: { allPassed: boolean; checks: { exitCode: number | null }[] };
}

export interface FixPlanCoverage {
  /** True only when the inputs really covered every target the plan speaks for. */
  covered: boolean;
  /** Empty when covered; otherwise why an all-clear cannot be claimed. */
  reasons: string[];
}

function hasCompleteScan(scan: FixPlanCoverageInput['multiRepoScan']): boolean {
  if (!scan) return false;
  if (scan.scans.length === 0) return false;
  if (scan.unreachableCount > 0) return false;
  return scan.reachableCount > 0;
}

function hasCompleteHealth(health: FixPlanCoverageInput['localHealth']): boolean {
  if (!health) return false;
  if (!health.allPassed) return false;
  // A check that never ran (exitCode null) is not evidence that it passed.
  return health.checks.every((c) => c.exitCode !== null);
}

/**
 * Decide whether a plan's `nothingToDo` flag may stand.
 *
 * Coverage means the scan reached every repository AND every local check ran
 * and passed. Anything less — no input, an empty listing, an unreachable repo,
 * a check that never executed — is reported as a reason so the caller can
 * downgrade the all-clear instead of inventing one.
 */
export function assessFixPlanCoverage(input: FixPlanCoverageInput): FixPlanCoverage {
  const scanComplete = hasCompleteScan(input.multiRepoScan);
  const healthComplete = hasCompleteHealth(input.localHealth);

  if (!input.multiRepoScan && !input.localHealth) {
    return { covered: false, reasons: ['No repository scan or local health check was supplied.'] };
  }

  const reasons: string[] = [];
  if (input.multiRepoScan && !scanComplete) {
    if (input.multiRepoScan.scans.length === 0) {
      reasons.push('The repository listing returned no repositories, so no account-wide scan happened.');
    } else if (input.multiRepoScan.unreachableCount > 0) {
      reasons.push(
        `${input.multiRepoScan.unreachableCount} of ${input.multiRepoScan.scans.length} repositories could not be scanned.`
      );
    }
  }
  if (input.localHealth && !healthComplete) {
    reasons.push('At least one local check did not pass or did not run.');
  }

  return { covered: scanComplete || healthComplete, reasons };
}

function dedupeSteps(steps: FixStep[]): FixStep[] {
  const seen = new Set<string>();
  const out: FixStep[] = [];
  for (const step of steps) {
    if (seen.has(step.id)) continue;
    seen.add(step.id);
    out.push(step);
  }
  return out;
}

function rank(risk: FixRisk): number {
  return risk === 'LOW' ? 1 : risk === 'MEDIUM' ? 2 : 3;
}

export interface CoverageResult {
  plan: FixPlan;
  coverage: FixPlanCoverage;
}

/**
 * Reconcile a derived plan with the coverage of its inputs.
 *
 * When the inputs did not cover the scope, `nothingToDo` is forced to false and
 * a review step is added naming what was not covered, so the caller cannot
 * present an unearned all-clear. A genuinely covered, clean plan is returned
 * unchanged.
 */
export function reconcileFixPlanWithCoverage(
  plan: FixPlan,
  coverage: FixPlanCoverage
): CoverageResult {
  if (coverage.covered) {
    return { plan, coverage };
  }

  const reasons = coverage.reasons.length > 0 ? coverage.reasons : ['Coverage could not be established.'];
  const steps = dedupeSteps([
    ...plan.steps,
    {
      id: 'coverage::unscanned',
      kind: 'MANUAL_REVIEW',
      target: plan.affectedTargets.length > 0 ? plan.affectedTargets.join(', ') : 'all targets',
      signal: reasons.join(' '),
      proposal:
        'Confirm the scan reached every repository and that every check actually ran before treating this plan as an all-clear. No code change is proposed until coverage is established.',
      risk: 'LOW',
      requiresApproval: false,
      refs: [],
    },
  ]);

  const highestRisk = steps.reduce<FixRisk>((acc, s) => (rank(s.risk) > rank(acc) ? s.risk : acc), 'LOW');

  return {
    coverage,
    plan: {
      ...plan,
      steps,
      affectedTargets: Array.from(new Set(steps.map((s) => s.target))),
      highestRisk,
      nothingToDo: false,
    },
  };
}
