// ==============================================================================
// Tests for the permission-gated GitHub automation workflow (items 20-23).
//
// The git operations run against a real temporary repository: real branches,
// real commits, real diffs. Nothing is mocked, so the branch-safety rules are
// proven against actual git behaviour rather than a stand-in.
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  isProtectedBranch,
  assertSafePushTarget,
  modifyAndPropose,
  executeFixPlan,
  realGitRunner,
  denyingApprovalGate,
  type ApprovalGate,
  type GitRunner,
  type CommandResult,
} from '../utils/github/automationWorkflow';
import type { FixPlan } from '../utils/github/fixPlanner';

let repo: string;

function git(args: string[], cwd = repo): string {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

function initRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-git-'));
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@example.test'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'node -e "console.log(1)"' } }));
  fs.writeFileSync(path.join(dir, 'a.txt'), 'original\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: dir });
  return dir;
}

const approveAll: ApprovalGate = {
  async requestApproval() {
    return { approved: true, approvedBy: 'TEST_HUMAN' };
  },
};

const denyAll: ApprovalGate = {
  async requestApproval() {
    return { approved: false, approvedBy: 'TEST_HUMAN', reason: 'not now' };
  },
};

/** Records the git commands issued, to prove nothing destructive was attempted. */
function recordingRunner(inner: GitRunner): { runner: GitRunner; calls: string[][] } {
  const calls: string[][] = [];
  return {
    calls,
    runner: {
      async run(args, cwd, timeoutMs) {
        calls.push(args);
        return inner.run(args, cwd, timeoutMs);
      },
    },
  };
}

beforeEach(() => {
  repo = initRepo();
  // The workflow refuses to work from a protected branch, so the fixture moves
  // onto a work branch first. Tests that need to prove that refusal check out
  // main again themselves.
  execFileSync('git', ['checkout', '-q', '-b', 'work/base'], { cwd: repo });
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('protected branch rules', () => {
  it('treats main, master and release branches as protected', () => {
    for (const b of ['main', 'master', 'MAIN', ' master ', 'develop', 'production', 'prod', 'trunk']) {
      expect(isProtectedBranch(b)).toBe(true);
    }
  });

  it('allows feature branches', () => {
    for (const b of ['feature/x', 'fix/thing', 'nightly/2026-09-19']) {
      expect(isProtectedBranch(b)).toBe(false);
    }
  });

  it('refuses to push to a protected branch', () => {
    const result = assertSafePushTarget('main');
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain('feature branches');
  });

  it('refuses an empty branch name', () => {
    expect(assertSafePushTarget('').ok).toBe(false);
  });

  it('allows a feature branch push', () => {
    expect(assertSafePushTarget('feature/x').ok).toBe(true);
  });
});

describe('modifyAndPropose: refusal paths', () => {
  it('refuses to work on a protected feature-branch name', async () => {
    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'main',
      change: {
        stepId: 's1',
        summary: 'x',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => ({ applied: true }),
      },
      approvalGate: approveAll,
    });

    expect(result.outcome).toBe('BLOCKED');
    expect(result.receipt.failureReason).toBe('PROTECTED_BRANCH');
    // a.txt must be untouched.
    expect(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8')).toBe('original\n');
  });

  it('refuses when the checkout sits on a protected branch', async () => {
    // Return to main so the guard has something to refuse.
    execFileSync('git', ['checkout', '-q', 'main'], { cwd: repo });

    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/x',
      change: {
        stepId: 's1',
        summary: 'x',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => ({ applied: true }),
      },
      approvalGate: approveAll,
    });

    expect(result.outcome).toBe('BLOCKED');
    expect(result.receipt.failureReason).toBe('CHECKOUT_ON_PROTECTED_BRANCH');
  });

  it('does not modify anything when approval is denied', async () => {
    const { runner, calls } = recordingRunner(realGitRunner);
    let applyCalled = false;

    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/x',
      change: {
        stepId: 's1',
        summary: 'change a.txt',
        summaryHi: 'x',
        risk: 'MEDIUM',
        files: ['a.txt'],
        apply: async () => {
          applyCalled = true;
          fs.writeFileSync(path.join(repo, 'a.txt'), 'changed\n');
          return { applied: true };
        },
      },
      approvalGate: denyAll,
      git: runner,
    });

    expect(result.outcome).toBe('BLOCKED');
    expect(applyCalled).toBe(false);
    expect(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8')).toBe('original\n');
    // No commit, and no push, was ever attempted.
    expect(calls.some((c) => c[0] === 'commit')).toBe(false);
    expect(calls.some((c) => c[0] === 'push')).toBe(false);
  });

  it('the default gate denies everything so nothing changes by accident', async () => {
    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/x',
      change: {
        stepId: 's1',
        summary: 'x',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => ({ applied: true }),
      },
      approvalGate: denyingApprovalGate,
    });

    expect(result.outcome).toBe('BLOCKED');
    expect(result.receipt.detailEn).toContain('not approved');
  });

  it('records a real branch and a real commit when approved', async () => {
    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/approved',
      change: {
        stepId: 's1',
        summary: 'change a.txt',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => {
          fs.writeFileSync(path.join(repo, 'a.txt'), 'changed\n');
          return { applied: true };
        },
      },
      approvalGate: approveAll,
      verifyChecks: ['test'],
      commitMessage: 'fix: change a.txt',
      git: realGitRunner,
    });

    expect(result.outcome).toBe('VERIFIED');
    expect(result.branch).toBe('feature/approved');
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.pushed).toBe(false);

    // Prove the commit exists in the real repository.
    const log = git(['log', '--oneline', '-1']);
    expect(log).toContain('fix: change a.txt');
    expect(git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()).toBe('feature/approved');
    expect(fs.readFileSync(path.join(repo, 'a.txt'), 'utf-8')).toBe('changed\n');
  });

  it('leaves the change uncommitted when post-change checks fail', async () => {
    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/broken',
      change: {
        stepId: 's1',
        summary: 'break the test script',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['package.json'],
        apply: async () => {
          fs.writeFileSync(
            path.join(repo, 'package.json'),
            JSON.stringify({ name: 'x', scripts: { test: 'node -e "process.exit(1)"' } })
          );
          return { applied: true };
        },
      },
      approvalGate: approveAll,
      verifyChecks: ['test'],
      git: realGitRunner,
    });

    expect(result.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toBe('POST_CHANGE_CHECKS_FAILED');
    expect(result.commitSha).toBeUndefined();
    // The initial commit is still the only one.
    const count = git(['rev-list', '--count', 'HEAD']).trim();
    expect(count).toBe('1');
  });

  it('reports FAILED when the change itself cannot be applied', async () => {
    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/x',
      change: {
        stepId: 's1',
        summary: 'cannot apply',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => ({ applied: false, reason: 'FILE_NOT_WRITABLE' }),
      },
      approvalGate: approveAll,
      git: realGitRunner,
    });

    expect(result.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toBe('FILE_NOT_WRITABLE');
  });

  it('reports FAILED when git status cannot be read', async () => {
    const brokenRunner: GitRunner = {
      async run(): Promise<CommandResult> {
        return { command: 'git status', exitCode: 128, stdout: '', stderr: 'not a git repository', started: true };
      },
    };

    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/x',
      change: {
        stepId: 's1',
        summary: 'x',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => ({ applied: true }),
      },
      approvalGate: approveAll,
      git: brokenRunner,
    });

    expect(result.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toBe('GIT_STATUS_UNAVAILABLE');
  });

  it('never pushes when push was not requested', async () => {
    const { runner, calls } = recordingRunner(realGitRunner);
    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/local-only',
      change: {
        stepId: 's1',
        summary: 'local change',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => {
          fs.writeFileSync(path.join(repo, 'a.txt'), 'local\n');
          return { applied: true };
        },
      },
      approvalGate: approveAll,
      verifyChecks: ['test'],
      git: runner,
    });

    expect(result.pushed).toBe(false);
    expect(calls.some((c) => c[0] === 'push')).toBe(false);
    expect(result.receipt.detailEn).toContain('Not pushed');
  });

  it('reports FAILED when a requested push fails', async () => {
    const failingPush: GitRunner = {
      async run(args, cwd, timeoutMs) {
        if (args[0] === 'push') {
          return { command: 'git push', exitCode: 128, stdout: '', stderr: 'remote rejected', started: true };
        }
        return realGitRunner.run(args, cwd, timeoutMs);
      },
    };

    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/pushfail',
      change: {
        stepId: 's1',
        summary: 'x',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => {
          fs.writeFileSync(path.join(repo, 'a.txt'), 'x\n');
          return { applied: true };
        },
      },
      approvalGate: approveAll,
      verifyChecks: ['test'],
      push: true,
      git: failingPush,
    });

    // A commit did happen, but the requested push did not: not a success.
    expect(result.outcome).toBe('FAILED');
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.pushed).toBe(false);
    expect(result.receipt.failureReason).toContain('remote rejected');
  });

  it('records DISPATCHED when the PR step fails after a successful push', async () => {
    const pushOk: GitRunner = {
      async run(args, cwd, timeoutMs) {
        if (args[0] === 'push') {
          return { command: 'git push', exitCode: 0, stdout: 'ok', stderr: '', started: true };
        }
        return realGitRunner.run(args, cwd, timeoutMs);
      },
    };

    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/prfail',
      change: {
        stepId: 's1',
        summary: 'x',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => {
          fs.writeFileSync(path.join(repo, 'a.txt'), 'x\n');
          return { applied: true };
        },
      },
      approvalGate: approveAll,
      verifyChecks: ['test'],
      push: true,
      createPullRequest: async () => ({ ok: false, error: 'PR creation refused' }),
      git: pushOk,
    });

    expect(result.pushed).toBe(true);
    expect(result.pullRequestUrl).toBeUndefined();
    expect(result.outcome).toBe('DISPATCHED');
  });

  it('captures the approval decision in the event trail', async () => {
    const result = await modifyAndPropose({
      workspace: repo,
      featureBranch: 'feature/trail',
      change: {
        stepId: 's1',
        summary: 'x',
        summaryHi: 'x',
        risk: 'LOW',
        files: ['a.txt'],
        apply: async () => {
          fs.writeFileSync(path.join(repo, 'a.txt'), 'x\n');
          return { applied: true };
        },
      },
      approvalGate: approveAll,
      verifyChecks: ['test'],
      git: realGitRunner,
    });

    const stages = result.events.map((e) => e.stage);
    expect(stages).toEqual(
      expect.arrayContaining(['PLANNING', 'CHECKING', 'FOUND', 'ASKING_PERMISSION', 'APPROVED', 'EXECUTING', 'VERIFYING', 'COMPLETED'])
    );
    const approved = result.events.find((e) => e.stage === 'APPROVED');
    expect(approved?.approvedBy).toBe('TEST_HUMAN');
  });
});

describe('executeFixPlan', () => {
  function plan(steps: FixPlan['steps']): FixPlan {
    return {
      steps,
      affectedTargets: [...new Set(steps.map((s) => s.target))],
      highestRisk: 'LOW',
      requiresCodeChange: true,
      nothingToDo: steps.length === 0,
      generatedAt: new Date().toISOString(),
      receipt: {
        action: 'test',
        target: 'test',
        outcome: 'VERIFIED',
        verified: true,
        detailEn: 'test',
        detailHi: 'test',
        evidence: null,
        failureReason: undefined,
      },
    } as FixPlan;
  }

  it('does nothing and says so for an empty plan', async () => {
    const report = await executeFixPlan({
      workspace: repo,
      plan: plan([]),
      featureBranch: 'feature/x',
      approvalGate: approveAll,
      materialize: async () => null,
    });

    expect(report.planWasEmpty).toBe(true);
    expect(report.results).toHaveLength(0);
    expect(report.receipt.detailEn).toContain('no steps');
    // An empty plan performed no work, so it must not report success.
    expect(report.receipt.outcome).toBe('NOT_CONFIGURED');
    expect(report.receipt.verified).toBe(false);
  });

  it('records NOT_CONFIGURED for a step with no implementation', async () => {
    const report = await executeFixPlan({
      workspace: repo,
      plan: plan([
        {
          id: 'step-1',
          kind: 'REPAIR_CI',
          target: 'acme/x',
          signal: 'workflow failed',
          proposal: 'fix it',
          risk: 'MEDIUM',
          requiresApproval: true,
          refs: [],
        },
      ]),
      featureBranch: 'feature/x',
      approvalGate: approveAll,
      materialize: async () => null,
    });

    expect(report.blockedSteps).toEqual(['step-1']);
    expect(report.results[0].outcome).toBe('NOT_CONFIGURED');
    expect(report.completedSteps).toHaveLength(0);
  });

  it('continues past a denied step rather than aborting the whole plan', async () => {
    let secondRan = false;

    const report = await executeFixPlan({
      workspace: repo,
      plan: plan([
        {
          id: 'step-deny',
          kind: 'REPAIR_LINT',
          target: 'a',
          signal: 's',
          proposal: 'p',
          risk: 'MEDIUM',
          requiresApproval: true,
          refs: [],
        },
        {
          id: 'step-ok',
          kind: 'REPAIR_LINT',
          target: 'b',
          signal: 's',
          proposal: 'p',
          risk: 'MEDIUM',
          requiresApproval: true,
          refs: [],
        },
      ]),
      featureBranch: 'feature/plan',
      approvalGate: denyAll,
      materialize: async (step) => {
        if (step.id === 'step-ok') secondRan = true;
        return {
          stepId: step.id,
          summary: step.id,
          summaryHi: step.id,
          risk: step.risk,
          files: ['a.txt'],
          apply: async () => {
            fs.writeFileSync(path.join(repo, 'a.txt'), `${step.id}\n`);
            return { applied: true };
          },
        };
      },
    });

    expect(report.results).toHaveLength(2);
    expect(report.blockedSteps).toEqual(['step-deny', 'step-ok']);
    expect(secondRan).toBe(true);
    expect(report.receipt.outcome).toBe('BLOCKED');
  });
});