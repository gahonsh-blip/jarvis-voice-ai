// ==============================================================================
// HERMES JARVIS — FIX PLAN GENERATION (backlog item 19)
//
// Turns real scan and health-check signals into an ordered, reviewable plan.
//
// A plan is a proposal, never an action. Every step states the signal it came
// from and whether it needs human approval before anything is modified. When no
// signal is present the plan says so — it never invents work to look useful.
// ==============================================================================

import type { RepoScan, MultiRepoScan } from './repoScanner';
import type { LocalHealthReport } from './localHealth';
import type { ExecutionReceipt } from '../executionTruth';
import { buildReceipt, makeEvidence } from '../executionTruth';

export type FixRisk = 'LOW' | 'MEDIUM' | 'HIGH';

export type FixStepKind =
  | 'REPAIR_CI'
  | 'REPAIR_TESTS'
  | 'REPAIR_LINT'
  | 'REPAIR_BUILD'
  | 'REVIEW_PR'
  | 'REVIEW_BRANCH'
  | 'REFRESH_HEAD'
  | 'MANUAL_REVIEW';

export interface FixStep {
  id: string;
  kind: FixStepKind;
  /** Repository or workspace the step applies to. */
  target: string;
  /** The observed signal that justifies this step. */
  signal: string;
  /** What the step proposes to do. */
  proposal: string;
  risk: FixRisk;
  /** True when a human must approve before any modification happens. */
  requiresApproval: boolean;
  /** Evidence references (URLs, commands) that support the signal. */
  refs: string[];
}

export interface FixPlan {
  steps: FixStep[];
  /** Repositories/workspaces that produced at least one step. */
  affectedTargets: string[];
  /** Highest risk present, or null when there is nothing to do. */
  highestRisk: FixRisk | null;
  /** True when at least one step touches code, tests or CI configuration. */
  requiresCodeChange: boolean;
  /** True when every signal is clean and there is genuinely nothing to fix. */
  nothingToDo: boolean;
  generatedAt: string;
  receipt: ExecutionReceipt;
}

function riskRank(r: FixRisk): number {
  return r === 'LOW' ? 1 : r === 'MEDIUM' ? 2 : 3;
}

/**
 * Builds a plan for a single repository from its scan.
 *
 * Only signals the scanner actually observed become steps. A repo with no
 * failing runs, no open PRs and no stale branches yields no steps.
 */
export function planForRepository(scan: RepoScan): FixStep[] {
  if (!scan.reachable) {
    return [
      {
        id: `${scan.fullName}::unreachable`,
        kind: 'MANUAL_REVIEW',
        target: scan.fullName,
        signal: `Repository could not be scanned: ${scan.reason}`,
        proposal:
          'Confirm the token has access to this repository, or exclude it from automation. No code change is proposed until the cause is known.',
        risk: 'LOW',
        requiresApproval: false,
        refs: [],
      },
    ];
  }

  const steps: FixStep[] = [];

  for (const run of scan.failingWorkflowRuns ?? []) {
    steps.push({
      id: `${scan.fullName}::ci-${run.id}`,
      kind: 'REPAIR_CI',
      target: scan.fullName,
      signal: `Workflow "${run.name}" on ${run.branch ?? 'unknown branch'} finished as ${run.conclusion}.`,
      proposal:
        'Read the failing job log, identify the root cause, and prepare a fix on a feature branch. The fix is not pushed until it is approved and retested.',
      risk: 'MEDIUM',
      requiresApproval: true,
      refs: [run.htmlUrl],
    });
  }

  for (const run of scan.abortedWorkflowRuns ?? []) {
    steps.push({
      id: `${scan.fullName}::ci-aborted-${run.id}`,
      kind: 'MANUAL_REVIEW',
      target: scan.fullName,
      signal: `Workflow "${run.name}" on ${run.branch ?? 'unknown branch'} ended as ${run.conclusion} rather than passing or failing.`,
      proposal:
        'Confirm whether the cancellation was intentional. Nothing is changed: an aborted run says nothing about whether the code is correct.',
      risk: 'LOW',
      requiresApproval: false,
      refs: [run.htmlUrl],
    });
  }

  for (const pr of scan.openPullRequests ?? []) {
    const mergeNote =
      pr.mergeable === false
        ? ' GitHub reports merge conflicts with the base branch.'
        : pr.mergeable === null
          ? ' GitHub has not finished computing mergeability.'
          : '';
    steps.push({
      id: `${scan.fullName}::pr-${pr.number}`,
      kind: 'REVIEW_PR',
      target: `${scan.fullName}#${pr.number}`,
      signal: `PR "${pr.title}" from ${pr.headBranch} into ${pr.baseBranch} is open${pr.draft ? ' (draft)' : ''}.${mergeNote}`,
      proposal:
        'Review the diff, run the test suite on the branch, and report. Merging into the default branch always requires explicit human approval.',
      risk: 'MEDIUM',
      requiresApproval: true,
      refs: [pr.htmlUrl],
    });
  }

  const branchesWithoutPrs = (scan.branches ?? []).filter(
    (b) => !b.isDefault && !(scan.openPullRequests ?? []).some((p) => p.headBranch === b.name)
  );
  if (branchesWithoutPrs.length > 0) {
    steps.push({
      id: `${scan.fullName}::branches`,
      kind: 'REVIEW_BRANCH',
      target: scan.fullName,
      signal: `${branchesWithoutPrs.length} branch(es) have no open pull request.`,
      proposal:
        'List the unmerged branches for human review. Deleting a branch is destructive, so no branch is removed automatically.',
      risk: 'LOW',
      requiresApproval: false,
      refs: branchesWithoutPrs.map((b) => `${scan.fullName}@${b.name}`),
    });
  }

  return steps;
}

export interface BuildFixPlanOptions {
  /** Repo scans to plan from, when the check runs remotely. */
  multiRepoScan?: MultiRepoScan;
  /** Local workspace health, when the check runs against a checkout. */
  localHealth?: LocalHealthReport;
}

/** Builds a combined plan from whatever real signals are available. */
export function buildFixPlan(options: BuildFixPlanOptions): FixPlan {
  const steps: FixStep[] = [];
  const generatedAt = new Date().toISOString();

  for (const scan of options.multiRepoScan?.scans ?? []) {
    steps.push(...planForRepository(scan));
  }

  const health = options.localHealth;
  if (health) {
    // A lint/test/build failure is a real signal only when the check actually ran.
    for (const check of health.checks) {
      if (check.passed || check.exitCode === null) continue;

      const kind: FixStepKind =
        check.kind === 'lint'
          ? 'REPAIR_LINT'
          : check.kind === 'test'
            ? 'REPAIR_TESTS'
            : 'REPAIR_BUILD';

      let detail = `\`${check.command}\` exited with code ${check.exitCode} after ${check.durationMs}ms.`;
      if (check.kind === 'lint' && health.lint && health.lint.errorCount > 0) {
        const first = health.lint.errors[0];
        detail += ` ${health.lint.errorCount} type error(s); first at ${first.file}:${first.line}:${first.column} (${first.code}).`;
      }
      if (check.kind === 'test' && health.tests) {
        const failed = health.tests.testsFailed;
        if (failed !== undefined) detail += ` ${failed} test(s) failed.`;
      }
      if (check.kind === 'build' && health.buildErrors.length > 0) {
        detail += ` First error line: ${health.buildErrors[0]}`;
      }

      steps.push({
        id: `local::${check.kind}`,
        kind,
        target: health.workspace,
        signal: detail,
        proposal:
          'Reproduce the failure locally, fix the cause, then rerun the same check to confirm the fix. The change stays on a feature branch until it passes.',
        risk: 'MEDIUM',
        requiresApproval: true,
        refs: [check.command],
      });
    }
  }

  const hasSignal = steps.length > 0;
  const affectedTargets = Array.from(new Set(steps.map((s) => s.target)));
  const highestRisk = hasSignal
    ? steps.reduce<FixRisk>(
        (acc, s) => (riskRank(s.risk) > riskRank(acc) ? s.risk : acc),
        'LOW'
      )
    : null;
  const requiresCodeChange = steps.some(
    (s) => s.kind === 'REPAIR_CI' || s.kind === 'REPAIR_TESTS' || s.kind === 'REPAIR_LINT' || s.kind === 'REPAIR_BUILD'
  );

  const plannedSources = [
    options.multiRepoScan ? 'repository scan' : null,
    options.localHealth ? 'local health checks' : null,
  ].filter(Boolean) as string[];

  return {
    steps,
    affectedTargets,
    highestRisk,
    requiresCodeChange,
    nothingToDo: !hasSignal,
    generatedAt,
    receipt: buildReceipt({
      action: 'github.buildFixPlan',
      target: affectedTargets.length > 0 ? affectedTargets.join(', ') : 'all targets',
      outcome: 'VERIFIED',
      detailEn:
        plannedSources.length === 0
          ? 'No scan or health-check input was supplied, so no plan could be derived.'
          : stagesSummary(plannedSources, steps),
      detailHi: hasSignal
        ? `${steps.length} सुधार चरण तैयार किए गए।`
        : 'कोई समस्या नहीं मिली, कोई सुधार आवश्यक नहीं।',
      evidence: makeEvidence(
        'remote_http_response',
        `Plan derived from ${plannedSources.join(' and ') || 'no input'}`,
        { ref: plannedSources.join(', ') }
      ),
    }),
  };
}

function stagesSummary(sources: string[], steps: FixStep[]): string {
  if (steps.length === 0) {
    return `Checked ${sources.join(' and ')}: no failing signals were found, so there is nothing to fix.`;
  }
  const byKind = steps.reduce<Record<string, number>>((acc, s) => {
    acc[s.kind] = (acc[s.kind] ?? 0) + 1;
    return acc;
  }, {});
  const breakdown = Object.entries(byKind)
    .map(([k, n]) => `${n} ${k}`)
    .join(', ');
  const approvals = steps.filter((s) => s.requiresApproval).length;
  return `Derived ${steps.length} step(s) from ${sources.join(' and ')} (${breakdown}). ${approvals} step(s) need human approval before any modification.`;
}

/**
 * Simulates what a proposed change would touch, without changing anything.
 *
 * Returns the files a step would be expected to affect so a human can see the
 * blast radius before approving. It deliberately does not read or modify code.
 */
export function describeFixScope(step: FixStep, candidateFiles: string[]): {
  stepId: string;
  candidateFiles: string[];
  note: string;
} {
  return {
    stepId: step.id,
    candidateFiles,
    note:
      candidateFiles.length === 0
        ? 'No candidate files were identified; the fix scope must be determined by reading the failing output.'
        : `${candidateFiles.length} candidate file(s) were identified from the failing signal. Review them before approving.`,
  };
}