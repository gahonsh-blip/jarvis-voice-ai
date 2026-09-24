// ==============================================================================
// Tests for fix-plan generation (item 19) and the nightly scheduler (item 24).
//
// The plan must be derivable only from signals that were really observed: a
// clean repository must produce an empty plan, and a check that never ran must
// not be turned into a repair step.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { planForRepository, buildFixPlan } from '../utils/github/fixPlanner';
import type { RepoScan, MultiRepoScan } from '../utils/github/repoScanner';
import type { LocalHealthReport } from '../utils/github/localHealth';
import { buildReceipt, makeEvidence } from '../utils/executionTruth';
import {
  nextRunAt,
  nightlyHistory,
  runNightlyCheck,
  DEFAULT_NIGHTLY_CONFIG,
  type NightlyRunRecord,
} from '../utils/github/nightlyScheduler';

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

describe('planForRepository', () => {
  it('produces no steps for a clean repository', () => {
    expect(planForRepository(scan())).toEqual([]);
  });

  it('proposes a review step for an unreachable repository', () => {
    const steps = planForRepository(scan({ reachable: false, reason: 'Not Found' }));
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe('MANUAL_REVIEW');
    expect(steps[0].signal).toContain('Not Found');
    // No code change should be proposed while the cause is unknown.
    expect(steps[0].requiresApproval).toBe(false);
  });

  it('proposes a CI repair for each failing run, with approval required', () => {
    const steps = planForRepository(
      scan({
        failingWorkflowRuns: [
          {
            id: 1,
            name: 'CI',
            branch: 'main',
            status: 'completed',
            conclusion: 'failure',
            createdAt: '2026-09-19T00:00:00Z',
            htmlUrl: 'https://example.test/run/1',
          },
        ],
      })
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe('REPAIR_CI');
    expect(steps[0].risk).toBe('MEDIUM');
    expect(steps[0].requiresApproval).toBe(true);
    expect(steps[0].refs).toContain('https://example.test/run/1');
  });

  it('treats an aborted run as a review, not a broken build', () => {
    const steps = planForRepository(
      scan({
        abortedWorkflowRuns: [
          {
            id: 2,
            name: 'CI',
            branch: 'feat/x',
            status: 'completed',
            conclusion: 'cancelled',
            createdAt: '2026-09-19T00:00:00Z',
            htmlUrl: 'https://example.test/run/2',
          },
        ],
      })
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe('MANUAL_REVIEW');
    expect(steps[0].requiresApproval).toBe(false);
  });

  it('proposes a PR review and flags merge conflicts', () => {
    const steps = planForRepository(
      scan({
        openPullRequests: [
          {
            number: 4,
            title: 'Add thing',
            state: 'open',
            draft: false,
            headBranch: 'feature/thing',
            baseBranch: 'main',
            mergeable: false,
            updatedAt: '2026-09-19T00:00:00Z',
            htmlUrl: 'https://example.test/pr/4',
          },
        ],
      })
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe('REVIEW_PR');
    expect(steps[0].signal).toContain('merge conflicts');
  });

  it('proposes a branch review when branches have no PR', () => {
    const steps = planForRepository(
      scan({
        branches: [
          { name: 'main', sha: 'a', isDefault: true },
          { name: 'stale/old', sha: 'b', isDefault: false },
        ],
        unmergedBranchCount: 1,
      })
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].kind).toBe('REVIEW_BRANCH');
    // Deleting a branch is destructive, so it is never automatic.
    expect(steps[0].proposal).toContain('no branch is removed automatically');
  });
});

describe('buildFixPlan', () => {
  it('reports nothing to do when there are no signals', () => {
    const multiRepoScan: MultiRepoScan = {
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
    };

    const plan = buildFixPlan({ multiRepoScan });
    expect(plan.nothingToDo).toBe(true);
    expect(plan.highestRisk).toBeNull();
    expect(plan.receipt.detailEn).toContain('nothing to fix');
  });

  it('turns failing local checks into repair steps', () => {
    const localHealth: LocalHealthReport = {
      workspace: '/w',
      checks: [
        {
          kind: 'lint',
          command: 'npm run --silent lint',
          passed: false,
          exitCode: 2,
          durationMs: 1000,
          stdoutTail: '',
          stderrTail: '',
          receipt: buildReceipt({
            action: 't',
            target: 't',
            outcome: 'VERIFIED',
            detailEn: 'failed',
            detailHi: 'failed',
          }),
        },
      ],
      lint: {
        errorCount: 1,
        errors: [{ file: 'server.ts', line: 86, column: 3, code: 'TS2552', message: 'oops' }],
      },
      buildErrors: [],
      allPassed: false,
      ranAt: new Date().toISOString(),
      receipt: buildReceipt({ action: 't', target: 't', outcome: 'VERIFIED', detailEn: 'x', detailHi: 'x' }),
    };

    const plan = buildFixPlan({ localHealth });
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].kind).toBe('REPAIR_LINT');
    expect(plan.steps[0].signal).toContain('server.ts:86:3');
    expect(plan.steps[0].signal).toContain('TS2552');
    expect(plan.requiresCodeChange).toBe(true);
  });

  it('ignores a check that passed', () => {
    const localHealth: LocalHealthReport = {
      workspace: '/w',
      checks: [
        {
          kind: 'test',
          command: 'npm run --silent test',
          passed: true,
          exitCode: 0,
          durationMs: 10,
          stdoutTail: '',
          stderrTail: '',
          receipt: buildReceipt({ action: 't', target: 't', outcome: 'VERIFIED', detailEn: 'ok', detailHi: 'ok' }),
        },
      ],
      buildErrors: [],
      allPassed: true,
      ranAt: new Date().toISOString(),
      receipt: buildReceipt({ action: 't', target: 't', outcome: 'VERIFIED', detailEn: 'x', detailHi: 'x' }),
    };

    expect(buildFixPlan({ localHealth }).steps).toEqual([]);
  });

  it('ignores a check that never ran', () => {
    const localHealth: LocalHealthReport = {
      workspace: '/w',
      checks: [
        {
          kind: 'build',
          command: 'npm run --silent build',
          passed: false,
          exitCode: null,
          durationMs: 0,
          stdoutTail: '',
          stderrTail: '',
          notConfiguredReason: 'no build script',
          receipt: buildReceipt({
            action: 't',
            target: 't',
            outcome: 'NOT_CONFIGURED',
            detailEn: 'not configured',
            detailHi: 'not configured',
          }),
        },
      ],
      buildErrors: [],
      allPassed: false,
      ranAt: new Date().toISOString(),
      receipt: buildReceipt({ action: 't', target: 't', outcome: 'NOT_CONFIGURED', detailEn: 'x', detailHi: 'x' }),
    };

    // A missing check is not a failure to repair.
    expect(buildFixPlan({ localHealth }).steps).toEqual([]);
  });
});

describe('nextRunAt', () => {
  it('schedules later today when the time has not passed', () => {
    const from = new Date('2026-09-19T00:00:00Z');
    const next = nextRunAt({ hour: 2, minute: 0 }, from);
    expect(new Date(next).getUTCHours()).toBe(2);
    expect(new Date(next).getUTCDate()).toBe(19);
  });

  it('rolls to tomorrow when the time has passed', () => {
    const from = new Date('2026-09-19T05:00:00Z');
    const next = nextRunAt({ hour: 2, minute: 0 }, from);
    expect(new Date(next).getUTCDate()).toBe(20);
  });
});

describe('nightlyHistory', () => {
  const run = (finishedAt: string): NightlyRunRecord => ({
    runId: 'r',
    startedAt: finishedAt,
    finishedAt,
    trigger: 'SCHEDULED',
    outcome: 'COMPLETED',
    scannedRepositories: 1,
    unreachableRepositories: 0,
    reposWithFailingCi: [],
    reposWithOpenPrs: [],
    plannedSteps: 0,
    planRequiresApproval: false,
  });

  it('reports no run history when none exists', () => {
    const history = nightlyHistory([], DEFAULT_NIGHTLY_CONFIG, new Date('2026-09-19T10:00:00Z'));
    expect(history.lastRunAt).toBeNull();
    expect(history.runs).toHaveLength(0);
  });

  it('flags a missed run when the last run predates the previous schedule', () => {
    const now = new Date('2026-09-19T10:00:00Z');
    // Last ran two days ago: yesterday's 02:00 slot was missed.
    const history = nightlyHistory([run('2026-09-17T02:05:00Z')], DEFAULT_NIGHTLY_CONFIG, now);
    expect(history.missedRun).toBe(true);
  });

  it('does not flag a miss when the last run was within the last cycle', () => {
    const now = new Date('2026-09-19T10:00:00Z');
    const history = nightlyHistory([run('2026-09-19T02:05:00Z')], DEFAULT_NIGHTLY_CONFIG, now);
    expect(history.missedRun).toBe(false);
  });
});

describe('runNightlyCheck', () => {
  it('records a completed run from a real scan result', async () => {
    const multiRepoScan: MultiRepoScan = {
      scans: [
        scan({ fullName: 'acme/a' }),
        scan({ fullName: 'acme/b', reachable: false, reason: 'Not Found' }),
      ],
      reachableCount: 1,
      unreachableCount: 1,
      reposWithFailingCi: [],
      reposWithOpenPrs: [],
      scannedAt: new Date().toISOString(),
      receipt: buildReceipt({
        action: 't',
        target: 't',
        outcome: 'DISPATCHED',
        detailEn: 'partial',
        detailHi: 'partial',
      }),
    };

    const result = await runNightlyCheck({
      github: { token: 't' },
      scanner: async () => multiRepoScan,
    });

    expect(result.record.outcome).toBe('COMPLETED');
    expect(result.record.scannedRepositories).toBe(2);
    expect(result.record.unreachableRepositories).toBe(1);
    // An incomplete sweep must not report as fully verified.
    expect(result.receipt.outcome).toBe('DISPATCHED');
  });

  it('records FAILED when nothing could be scanned', async () => {
    const failed: MultiRepoScan = {
      scans: [],
      reachableCount: 0,
      unreachableCount: 0,
      reposWithFailingCi: [],
      reposWithOpenPrs: [],
      scannedAt: new Date().toISOString(),
      receipt: buildReceipt({
        action: 't',
        target: 't',
        outcome: 'FAILED',
        detailEn: 'Bad credentials',
        detailHi: 'x',
        failureReason: 'Bad credentials',
      }),
    };

    const result = await runNightlyCheck({ github: { token: 't' }, scanner: async () => failed });
    expect(result.record.outcome).toBe('FAILED');
    expect(result.record.error).toContain('Bad credentials');
    expect(result.receipt.outcome).toBe('FAILED');
  });

  it('reports NOT_CONFIGURED when no token is present', async () => {
    const result = await runNightlyCheck({ github: { token: '' } });
    expect(result.record.outcome).toBe('FAILED');
    expect(result.record.error).toContain('GITHUB_TOKEN');
  });
});