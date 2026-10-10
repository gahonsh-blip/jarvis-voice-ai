// ==============================================================================
// Tests for fix-plan coverage truth (item 13, continued).
//
// `POST /api/github/fix-plan` reports `nothingToDo` straight from `buildFixPlan`.
// That flag is derived only from the steps the plan could build, so a scan that
// returned nothing — or returned every repository unreachable — yields no steps
// and a false all-clear. These tests pin the gap in the raw planner and prove
// the coverage guard closes it without inventing work for a genuinely clean run.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { buildFixPlan, type FixPlan } from '../utils/github/fixPlanner';
import type { MultiRepoScan, RepoScan } from '../utils/github/repoScanner';
import type { LocalHealthReport } from '../utils/github/localHealth';
import { buildReceipt, makeEvidence } from '../utils/executionTruth';
import {
  assessFixPlanCoverage,
  reconcileFixPlanWithCoverage,
} from '../utils/hardening/fixPlanCoverage';

function scan(overrides: Partial<RepoScan> = {}): RepoScan {
  return {
    fullName: 'acme/widgets',
    reachable: true,
    defaultBranch: 'main',
    headSha: 'a'.repeat(40),
    branches: [{ name: 'main', sha: 'a'.repeat(40), isDefault: true }],
    openPullRequests: [],
    recentWorkflowRuns: [],
    failingWorkflowRuns: [],
    abortedWorkflowRuns: [],
    ciConfigured: true,
    unmergedBranchCount: 0,
    scannedAt: new Date().toISOString(),
    receipt: buildReceipt({
      action: 'test',
      target: 'test',
      outcome: 'VERIFIED',
      detailEn: 'ok',
      detailHi: 'ok',
      evidence: makeEvidence('remote_http_response', 'ok'),
    }),
    ...overrides,
  };
}

function multiRepoScan(overrides: Partial<MultiRepoScan> = {}): MultiRepoScan {
  return {
    scans: [scan()],
    reachableCount: 1,
    unreachableCount: 0,
    reposWithFailingCi: [],
    reposWithOpenPrs: [],
    scannedAt: new Date().toISOString(),
    receipt: buildReceipt({
      action: 't',
      target: 't',
      outcome: 'VERIFIED',
      detailEn: 'ok',
      detailHi: 'ok',
    }),
    ...overrides,
  };
}

function localHealth(overrides: Partial<LocalHealthReport> = {}): LocalHealthReport {
  return {
    workspace: '/w',
    checks: [],
    buildErrors: [],
    allPassed: true,
    ranAt: new Date().toISOString(),
    receipt: buildReceipt({ action: 't', target: 't', outcome: 'VERIFIED', detailEn: 'x', detailHi: 'x' }),
    ...overrides,
  };
}

function check(exitCode: number | null): LocalHealthReport['checks'][number] {
  return {
    kind: 'test',
    command: 'npm run --silent test',
    passed: exitCode === 0,
    exitCode,
    durationMs: 1,
    stdoutTail: '',
    stderrTail: '',
    receipt: buildReceipt({ action: 't', target: 't', outcome: 'VERIFIED', detailEn: 'x', detailHi: 'x' }),
  };
}

describe('assessFixPlanCoverage', () => {
  it('refuses to cover an empty account scan', () => {
    const result = assessFixPlanCoverage({
      multiRepoScan: multiRepoScan({ scans: [], reachableCount: 0, unreachableCount: 0 }),
    });
    expect(result.covered).toBe(false);
    expect(result.reasons.join(' ')).toContain('no repositories');
  });

  it('refuses to cover a scan with an unreachable repository', () => {
    const result = assessFixPlanCoverage({
      multiRepoScan: multiRepoScan({
        scans: [scan(), scan({ fullName: 'acme/broken', reachable: false, reason: 'Not Found' })],
        reachableCount: 1,
        unreachableCount: 1,
      }),
    });
    expect(result.covered).toBe(false);
    expect(result.reasons.join(' ')).toContain('could not be scanned');
  });

  it('covers a scan that reached every repository', () => {
    expect(assessFixPlanCoverage({ multiRepoScan: multiRepoScan() }).covered).toBe(true);
  });

  it('refuses to cover a local report whose check never ran', () => {
    const result = assessFixPlanCoverage({
      localHealth: localHealth({
        checks: [check(null)],
        allPassed: true,
      }),
    });
    expect(result.covered).toBe(false);
  });

  it('covers a local report where every check ran and passed', () => {
    const result = assessFixPlanCoverage({
      localHealth: localHealth({ checks: [check(0), check(0)], allPassed: true }),
    });
    expect(result.covered).toBe(true);
  });

  it('refuses to cover when no input was supplied at all', () => {
    const result = assessFixPlanCoverage({});
    expect(result.covered).toBe(false);
    expect(result.reasons.join(' ')).toContain('No repository scan or local health check');
  });
});

describe('reconcileFixPlanWithCoverage', () => {
  it('downgrades an all-clear the raw planner would have claimed', () => {
    const emptyScan = multiRepoScan({ scans: [], reachableCount: 0, unreachableCount: 0 });

    // The raw planner cannot tell "nothing found" from "nothing scanned".
    const raw = buildFixPlan({ multiRepoScan: emptyScan });
    expect(raw.nothingToDo).toBe(true);

    const { plan, coverage } = reconcileFixPlanWithCoverage(raw, assessFixPlanCoverage({ multiRepoScan: emptyScan }));
    expect(coverage.covered).toBe(false);
    expect(plan.nothingToDo).toBe(false);
    expect(plan.steps.some((s) => s.id === 'coverage::unscanned')).toBe(true);
    expect(plan.highestRisk).not.toBeNull();
  });

  it('names the uncovered repository in the review step', () => {
    const partial = multiRepoScan({
      scans: [scan(), scan({ fullName: 'acme/broken', reachable: false, reason: 'Not Found' })],
      reachableCount: 1,
      unreachableCount: 1,
    });
    const raw = buildFixPlan({ multiRepoScan: partial });
    const { plan } = reconcileFixPlanWithCoverage(raw, assessFixPlanCoverage({ multiRepoScan: partial }));
    const review = plan.steps.find((s) => s.id === 'coverage::unscanned');
    expect(review?.signal).toContain('could not be scanned');
  });

  it('leaves a genuinely clean, fully covered plan untouched', () => {
    const clean = buildFixPlan({ multiRepoScan: multiRepoScan() });
    expect(clean.nothingToDo).toBe(true);

    const { plan, coverage } = reconcileFixPlanWithCoverage(
      clean,
      assessFixPlanCoverage({ multiRepoScan: multiRepoScan() })
    );
    expect(coverage.covered).toBe(true);
    expect(plan.nothingToDo).toBe(true);
    expect(plan.steps).toEqual([]);
    expect(plan).toBe(clean);
  });

  it('does not duplicate the review step when coverage is already noted', () => {
    const partial = multiRepoScan({
      scans: [scan({ reachable: false, reason: 'Not Found' })],
      reachableCount: 0,
      unreachableCount: 1,
    });
    const raw = buildFixPlan({ multiRepoScan: partial });
    const coverage = assessFixPlanCoverage({ multiRepoScan: partial });
    const once = reconcileFixPlanWithCoverage(raw, coverage).plan;
    const twice = reconcileFixPlanWithCoverage(once, coverage).plan;
    expect(twice.steps.filter((s) => s.id === 'coverage::unscanned')).toHaveLength(1);
  });
});

// The planner stamps `receipt: VERIFIED` unconditionally, so a scan that reached
// nothing produced a VERIFIED receipt — a fake success distinct from the
// `nothingToDo` flag. These pin the receipt to the coverage verdict.
describe('reconcileFixPlanWithCoverage — receipt honesty', () => {
  it('downgrades a VERIFIED receipt when the scan reached no repositories', () => {
    const emptyScan = multiRepoScan({ scans: [], reachableCount: 0, unreachableCount: 0 });
    const raw = buildFixPlan({ multiRepoScan: emptyScan });
    // The raw planner claims the plan was verified even though nothing was scanned.
    expect(raw.receipt.outcome).toBe('VERIFIED');

    const { plan } = reconcileFixPlanWithCoverage(raw, assessFixPlanCoverage({ multiRepoScan: emptyScan }));
    expect(plan.receipt.outcome).not.toBe('VERIFIED');
    expect(plan.receipt.verified).toBe(false);
    expect(plan.receipt.detailEn).not.toMatch(/nothing to fix/i);
  });

  it('downgrades the receipt when a repository was unreachable', () => {
    const partial = multiRepoScan({
      scans: [scan(), scan({ fullName: 'acme/broken', reachable: false, reason: 'Not Found' })],
      reachableCount: 1,
      unreachableCount: 1,
    });
    const raw = buildFixPlan({ multiRepoScan: partial });
    const { plan } = reconcileFixPlanWithCoverage(raw, assessFixPlanCoverage({ multiRepoScan: partial }));
    expect(plan.receipt.outcome).toBe('UNVERIFIED');
    expect(plan.receipt.detailEn).toContain('Coverage not established');
  });

  it('leaves the honest VERIFIED receipt on a fully covered clean plan', () => {
    const clean = buildFixPlan({ multiRepoScan: multiRepoScan() });
    const { plan } = reconcileFixPlanWithCoverage(clean, assessFixPlanCoverage({ multiRepoScan: multiRepoScan() }));
    expect(plan.receipt.outcome).toBe('VERIFIED');
    expect(plan.receipt.verified).toBe(true);
  });
});
