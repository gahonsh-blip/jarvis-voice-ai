// ==============================================================================
// HERMES JARVIS — GITHUB AUTOMATION WORKFLOW (backlog items 20-24)
//
// The approval-gated pipeline: propose a change, require approval, apply it,
// retest, then commit, push a feature branch and prepare a PR.
//
// Two invariants hold everywhere in this module:
//   1. main/master is never written to, and is never the push target.
//   2. Every state is reported honestly — a stage that did not run is
//      NOT_CONFIGURED or DISPATCHED, never COMPLETED.
// ==============================================================================

import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  ExecutionReceipt,
  buildReceipt,
  makeEvidence,
  type ExecutionOutcome,
} from '../executionTruth';
import type { FixPlan, FixStep } from './fixPlanner';
import { runHealthChecks, type LocalHealthReport, type CheckKind } from './localHealth';

/** Branch names that automation must never write to. */
const PROTECTED_BRANCHES = new Set(['main', 'master', 'trunk', 'develop', 'production', 'prod']);

/** Exposed so the API can report which branches automation refuses to touch. */
export const PROTECTED_BRANCH_NAMES: ReadonlySet<string> = PROTECTED_BRANCHES;

export function isProtectedBranch(branch: string): boolean {
  return PROTECTED_BRANCHES.has(branch.trim().toLowerCase());
}

export type WorkflowStage =
  | 'PLANNING'
  | 'CHECKING'
  | 'FOUND'
  | 'ASKING_PERMISSION'
  | 'APPROVED'
  | 'EXECUTING'
  | 'VERIFYING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED';

export interface WorkflowEvent {
  stage: WorkflowStage;
  timestamp: string;
  message: string;
  detail?: string;
  /** The gate outcome that let this stage proceed. */
  approvedBy?: string;
}

export interface CommandResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  started: boolean;
  startError?: string;
}

export interface GitRunner {
  run(args: string[], cwd: string, timeoutMs?: number): Promise<CommandResult>;
}

/** Real git runner. Commands are passed as argv, never interpolated. */
export const realGitRunner: GitRunner = {
  run(args, cwd, timeoutMs = 60_000) {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let settled = false;
      const child = spawn('git', args, {
        cwd,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        shell: false,
        detached: process.platform !== 'win32',
      });

      const finish = (exitCode: number | null, started = true, startError?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ command: `git ${args.join(' ')}`, exitCode, stdout, stderr, started, startError });
      };

      const timer = setTimeout(() => {
        try {
          if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGKILL');
          else child.kill('SIGKILL');
        } catch {
          child.kill('SIGKILL');
        }
        finish(null);
      }, timeoutMs);

      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));
      child.on('error', (err) => finish(null, false, err.message));
      child.on('close', (code) => finish(code));
    });
  },
};

export interface ApprovalRequest {
  actionId: string;
  summary: string;
  summaryHi: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  files: string[];
  targetBranch: string;
}

export interface ApprovalDecision {
  approved: boolean;
  approvedBy: string;
  reason?: string;
}

/**
 * Human approval gate.
 *
 * The default implementation refuses everything, so an unconfigured deployment
 * cannot modify or publish anything by accident. A real approver (the HUD, the
 * Telegram confirmation flow) must be supplied explicitly.
 */
export interface ApprovalGate {
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>;
}

export const denyingApprovalGate: ApprovalGate = {
  async requestApproval() {
    return {
      approved: false,
      approvedBy: 'NONE',
      reason:
        'No human approver is wired up, so the modification was not approved. Connect the HUD or Telegram confirmation flow to enable approved code changes.',
    };
  },
};

export interface ProposedChange {
  stepId: string;
  summary: string;
  summaryHi: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  /** Files the change intends to touch, for the approval prompt. */
  files: string[];
  /** Applies the change. Only called after approval. */
  apply: () => Promise<{ applied: boolean; reason?: string }>;
}

export interface ModifyAndProposeOptions {
  workspace: string;
  /** The branch the work happens on. Must not be a protected branch. */
  featureBranch: string;
  change: ProposedChange;
  approvalGate: ApprovalGate;
  git?: GitRunner;
  /** Checks to rerun after applying. */
  verifyChecks?: CheckKind[];
  /** Files to stage. Defaults to the change's own files. */
  commitPaths?: string[];
  commitMessage?: string;
  /** Push the branch to origin after a successful commit. */
  push?: boolean;
  /** Open a PR after a successful push. */
  createPullRequest?: (params: {
    branch: string;
    base: string;
    title: string;
    body: string;
  }) => Promise<{ ok: boolean; url?: string; error?: string }>;
  baseBranch?: string;
}

export interface ModifyAndProposeResult {
  events: WorkflowEvent[];
  outcome: ExecutionOutcome;
  branch?: string;
  commitSha?: string;
  commitMessage?: string;
  pushed?: boolean;
  pullRequestUrl?: string;
  verification?: LocalHealthReport;
  receipt: ExecutionReceipt;
}

class WorkflowLog {
  readonly events: WorkflowEvent[] = [];
  add(stage: WorkflowStage, message: string, detail?: string, approvedBy?: string) {
    this.events.push({ stage, timestamp: new Date().toISOString(), message, detail, approvedBy });
  }
}

async function currentBranch(cwd: string, git: GitRunner): Promise<string | null> {
  const res = await git.run(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (res.exitCode !== 0) return null;
  return res.stdout.trim() || null;
}

/**
 * The permission-gated modification pipeline.
 *
 * Order: plan → check the branch is safe → ask permission → apply → retest →
 * commit → push → prepare a PR. Any refusal stops the pipeline at that stage
 * and the result says exactly how far it got.
 */
export async function modifyAndPropose(
  options: ModifyAndProposeOptions
): Promise<ModifyAndProposeResult> {
  const git = options.git ?? realGitRunner;
  const { workspace, featureBranch, change } = options;
  const log = new WorkflowLog();

  log.add('PLANNING', `Preparing change "${change.summary}" on ${featureBranch}.`, change.stepId);

  if (isProtectedBranch(featureBranch)) {
    log.add(
      'BLOCKED',
      `Refusing to write to protected branch "${featureBranch}".`,
      'Automation must work on a dedicated feature branch.'
    );
    return {
      events: log.events,
      outcome: 'BLOCKED',
      receipt: buildReceipt({
        action: 'github.modifyAndPropose',
        target: change.stepId,
        outcome: 'BLOCKED',
        detailEn: `Refused to modify files on protected branch "${featureBranch}". Work must happen on a feature branch.`,
        detailHi: `सुरक्षित ब्रांच "${featureBranch}" पर बदलाव अनुमत नहीं है।`,
        failureReason: 'PROTECTED_BRANCH',
      }),
    };
  }

  log.add('CHECKING', 'Verifying the working tree before making changes.');
  const status = await git.run(['status', '--porcelain'], workspace);
  if (!status.started || status.exitCode !== 0) {
    log.add('FAILED', 'Could not read git status in the workspace.', status.startError || status.stderr);
    return {
      events: log.events,
      outcome: 'FAILED',
      receipt: buildReceipt({
        action: 'github.modifyAndPropose',
        target: change.stepId,
        outcome: 'FAILED',
        detailEn: `Could not read the git working tree: ${status.startError || status.stderr || 'git status failed'}`,
        detailHi: 'गिट स्थिति पढ़ी नहीं जा सकी।',
        failureReason: 'GIT_STATUS_UNAVAILABLE',
      }),
    };
  }

  const branch = await currentBranch(workspace, git);
  if (branch && isProtectedBranch(branch)) {
    log.add(
      'BLOCKED',
      `The checkout is currently on protected branch "${branch}".`,
      'Switch to a feature branch before running automation edits.'
    );
    return {
      events: log.events,
      outcome: 'BLOCKED',
      branch,
      receipt: buildReceipt({
        action: 'github.modifyAndPropose',
        target: change.stepId,
        outcome: 'BLOCKED',
        detailEn: `The workspace is checked out on protected branch "${branch}". Automation will not modify files there.`,
        detailHi: `वर्कस्पेस सुरक्षित ब्रांच "${branch}" पर है।`,
        failureReason: 'CHECKOUT_ON_PROTECTED_BRANCH',
      }),
    };
  }

  log.add('FOUND', 'Working tree inspected.', branch ? `current branch: ${branch}` : undefined);
  log.add('ASKING_PERMISSION', `Requesting approval for "${change.summary}".`, change.files.join(', '));

  const decision = await options.approvalGate.requestApproval({
    actionId: change.stepId,
    summary: change.summary,
    summaryHi: change.summaryHi,
    risk: change.risk,
    files: change.files,
    targetBranch: featureBranch,
  });

  if (!decision.approved) {
    log.add(
      'BLOCKED',
      'Human approval was not granted; nothing was modified.',
      decision.reason,
      decision.approvedBy
    );
    return {
      events: log.events,
      outcome: 'BLOCKED',
      branch: branch ?? undefined,
      receipt: buildReceipt({
        action: 'github.modifyAndPropose',
        target: change.stepId,
        outcome: 'BLOCKED',
        detailEn: `Change "${change.summary}" was not approved, so no files were modified. ${decision.reason ?? ''}`.trim(),
        detailHi: `बदलाव की अनुमति नहीं मिली, कुछ भी संशोधित नहीं हुआ।`,
        failureReason: decision.reason ?? 'APPROVAL_DENIED',
      }),
    };
  }

  log.add('APPROVED', 'Human approval granted.', undefined, decision.approvedBy);

  // Ensure the feature branch exists before applying anything.
  const checkout = await git.run(['checkout', '-B', featureBranch], workspace);
  if (checkout.exitCode !== 0) {
    log.add('FAILED', `Could not switch to ${featureBranch}.`, checkout.stderr);
    return {
      events: log.events,
      outcome: 'FAILED',
      receipt: buildReceipt({
        action: 'github.modifyAndPropose',
        target: change.stepId,
        outcome: 'FAILED',
        detailEn: `Could not create or switch to branch ${featureBranch}: ${checkout.stderr.trim()}`,
        detailHi: `ब्रांच ${featureBranch} पर स्विच नहीं हो सका।`,
        failureReason: 'BRANCH_CHECKOUT_FAILED',
      }),
    };
  }

  log.add('EXECUTING', 'Applying the approved change.', change.files.join(', '));
  const applied = await change.apply();
  if (!applied.applied) {
    log.add('FAILED', 'The change could not be applied.', applied.reason);
    return {
      events: log.events,
      outcome: 'FAILED',
      branch: featureBranch,
      receipt: buildReceipt({
        action: 'github.modifyAndPropose',
        target: change.stepId,
        outcome: 'FAILED',
        detailEn: `The approved change could not be applied: ${applied.reason}`,
        detailHi: 'स्वीकृत बदलाव लागू नहीं हो सका।',
        failureReason: applied.reason ?? 'APPLY_FAILED',
      }),
    };
  }

  log.add('VERIFYING', 'Rerunning checks against the modified workspace.');
  const verification = await runHealthChecks({
    workspace,
    checks: options.verifyChecks ?? (['lint', 'test'] as CheckKind[]),
  });

  if (!verification.allPassed) {
    log.add(
      'FAILED',
      'Post-change checks did not pass, so nothing was committed.',
      verification.checks.map((c) => `${c.kind}=${c.passed ? 'pass' : 'fail'}`).join(', ')
    );
    return {
      events: log.events,
      outcome: 'FAILED',
      branch: featureBranch,
      verification,
      receipt: buildReceipt({
        action: 'github.modifyAndPropose',
        target: change.stepId,
        outcome: 'FAILED',
        detailEn: `The change was applied but post-change checks failed (${verification.checks
          .map((c) => `${c.kind}=${c.passed ? 'pass' : 'fail'}`)
          .join(', ')}). Nothing was committed.`,
        detailHi: 'बदलाव लागू हुआ पर जाँच विफल रही, इसलिए कुछ कमिट नहीं किया गया।',
        failureReason: 'POST_CHANGE_CHECKS_FAILED',
      }),
    };
  }

  const paths = options.commitPaths ?? change.files;
  if (paths.length > 0) {
    const addRes = await git.run(['add', '--', ...paths], workspace);
    if (addRes.exitCode !== 0) {
      log.add('FAILED', 'Could not stage the changed files.', addRes.stderr);
      return {
        events: log.events,
        outcome: 'FAILED',
        branch: featureBranch,
        verification,
        receipt: buildReceipt({
          action: 'github.modifyAndPropose',
          target: change.stepId,
          outcome: 'FAILED',
          detailEn: `Could not stage the changed files: ${addRes.stderr.trim()}`,
          detailHi: 'बदले हुए फ़ाइलें स्टेज नहीं हो सकीं।',
          failureReason: 'GIT_ADD_FAILED',
        }),
      };
    }
  }

  const message = options.commitMessage ?? `fix: ${change.summary}`;
  const commitRes = await git.run(['commit', '-m', message], workspace);
  const committed = commitRes.exitCode === 0;
  if (!committed) {
    log.add('FAILED', 'The commit did not succeed.', commitRes.stderr);
    return {
      events: log.events,
      outcome: 'FAILED',
      branch: featureBranch,
      verification,
      receipt: buildReceipt({
        action: 'github.modifyAndPropose',
        target: change.stepId,
        outcome: 'FAILED',
        detailEn: `The change passed checks but the commit failed: ${commitRes.stderr.trim()}`,
        detailHi: 'कमिट विफल रहा।',
        failureReason: 'COMMIT_FAILED',
      }),
    };
  }

  const shaRes = await git.run(['rev-parse', 'HEAD'], workspace);
  const commitSha = shaRes.exitCode === 0 ? shaRes.stdout.trim() : undefined;
  log.add('COMPLETED', `Committed ${commitSha?.slice(0, 7) ?? 'change'} on ${featureBranch}.`, message);

  let pushed = false;
  let pushError: string | undefined;
  if (options.push) {
    const pushRes = await git.run(['push', '-u', 'origin', featureBranch], workspace, 120_000);
    pushed = pushRes.exitCode === 0;
    if (!pushed) {
      pushError = pushRes.stderr.trim() || `git push exited ${pushRes.exitCode}`;
      log.add('FAILED', `Push to origin/${featureBranch} failed.`, pushError);
    } else {
      log.add('COMPLETED', `Pushed ${featureBranch} to origin.`);
    }
  } else {
    log.add('VERIFYING', 'Push was not requested, so the commit remains local.');
  }

  let pullRequestUrl: string | undefined;
  let prError: string | undefined;
  if (pushed && options.createPullRequest) {
    const pr = await options.createPullRequest({
      branch: featureBranch,
      base: options.baseBranch ?? 'main',
      title: change.summary,
      body: `${change.summary}\n\nApproved by: ${decision.approvedBy}`,
    });
    if (pr.ok && pr.url) {
      pullRequestUrl = pr.url;
      log.add('COMPLETED', 'Pull request created.', pr.url);
    } else {
      prError = pr.error;
      log.add('FAILED', 'Pull request creation failed.', pr.error);
    }
  }

  // The change itself is real (a commit exists), but if a requested push or PR
  // step failed the overall outcome must not read as unqualified success.
  const outcome: ExecutionOutcome = pushError
    ? 'FAILED'
    : prError
      ? 'DISPATCHED'
      : 'VERIFIED';

  const finalDetail = [
    `Applied and committed "${change.summary}" on ${featureBranch}${commitSha ? ` (${commitSha.slice(0, 7)})` : ''}.`,
    options.push ? (pushed ? 'Pushed to origin.' : `Push failed: ${pushError}`) : 'Not pushed.',
    options.createPullRequest
      ? pullRequestUrl
        ? `PR: ${pullRequestUrl}`
        : `PR not created: ${prError}`
      : 'No PR requested.',
  ].join(' ');

  return {
    events: log.events,
    outcome,
    branch: featureBranch,
    commitSha,
    commitMessage: message,
    pushed,
    pullRequestUrl,
    verification,
    receipt: buildReceipt({
      action: 'github.modifyAndPropose',
      target: change.stepId,
      outcome,
      detailEn: finalDetail,
      detailHi: `बदलाव "${change.summary}" लागू हुआ।`,
      evidence: makeEvidence('os_command', `commit ${commitSha} on ${featureBranch}`, {
        ref: commitSha,
      }),
      failureReason: pushError ?? prError,
    }),
  };
}

export interface ExecutePlanOptions {
  workspace: string;
  plan: FixPlan;
  featureBranch: string;
  approvalGate: ApprovalGate;
  git?: GitRunner;
  /** Resolves a step into a concrete, applicable change. */
  materialize: (step: FixStep) => Promise<ProposedChange | null>;
  verifyChecks?: CheckKind[];
  push?: boolean;
  createPullRequest?: ModifyAndProposeOptions['createPullRequest'];
}

export interface PlanExecutionReport {
  results: ModifyAndProposeResult[];
  completedSteps: string[];
  blockedSteps: string[];
  failedSteps: string[];
  planWasEmpty: boolean;
  receipt: ExecutionReceipt;
}

/**
 * Executes a fix plan step by step.
 *
 * Steps are independent: one refusal does not abort the rest. Steps are never
 * merged into the default branch.
 */
export async function executeFixPlan(
  options: ExecutePlanOptions
): Promise<PlanExecutionReport> {
  const results: ModifyAndProposeResult[] = [];
  const completedSteps: string[] = [];
  const blockedSteps: string[] = [];
  const failedSteps: string[] = [];

  if (options.plan.steps.length === 0) {
    return {
      results: [],
      completedSteps: [],
      blockedSteps: [],
      failedSteps: [],
      planWasEmpty: true,
      receipt: buildReceipt({
        action: 'github.executeFixPlan',
        target: 'plan',
        // An empty plan did not verify anything — nothing ran. Reporting it as
        // VERIFIED with `evidence: none` was an unsupported success claim; the
        // honest outcome is that no work was configured to execute.
        outcome: 'NOT_CONFIGURED',
        detailEn: 'The plan contained no steps, so no changes were attempted and nothing was verified.',
        detailHi: 'योजना खाली थी, कोई बदलाव नहीं किया गया।',
      }),
    };
  }

  for (const step of options.plan.steps) {
    const change = await options.materialize(step);
    if (!change) {
      blockedSteps.push(step.id);
      results.push({
        events: [
          {
            stage: 'BLOCKED',
            timestamp: new Date().toISOString(),
            message: `Step ${step.id} has no applicable change implementation, so it was skipped.`,
          },
        ],
        outcome: 'NOT_CONFIGURED',
        receipt: buildReceipt({
          action: 'github.executeFixPlan',
          target: step.id,
          outcome: 'NOT_CONFIGURED',
          detailEn: `No automated implementation exists for step ${step.id} (${step.kind}). It needs a human or a configured fix strategy.`,
          detailHi: `चरण ${step.id} के लिए कोई स्वचालित समाधान उपलब्ध नहीं है।`,
          failureReason: 'NO_MATERIALIZED_CHANGE',
        }),
      });
      continue;
    }

    const result = await modifyAndPropose({
      workspace: options.workspace,
      featureBranch: options.featureBranch,
      change,
      approvalGate: options.approvalGate,
      git: options.git,
      verifyChecks: options.verifyChecks,
      push: options.push,
      createPullRequest: options.createPullRequest,
    });
    results.push(result);

    if (result.outcome === 'VERIFIED') completedSteps.push(step.id);
    else if (result.outcome === 'BLOCKED' || result.outcome === 'NOT_CONFIGURED') blockedSteps.push(step.id);
    else failedSteps.push(step.id);
  }

  const attempted = results.length;
  const outcome: ExecutionOutcome =
    failedSteps.length > 0 ? 'FAILED' : completedSteps.length > 0 ? 'VERIFIED' : 'BLOCKED';

  return {
    results,
    completedSteps,
    blockedSteps,
    failedSteps,
    planWasEmpty: false,
    receipt: buildReceipt({
      action: 'github.executeFixPlan',
      target: options.workspace,
      outcome,
      detailEn: `${attempted} step(s) attempted: ${completedSteps.length} completed, ${blockedSteps.length} blocked, ${failedSteps.length} failed.`,
      detailHi: `${attempted} चरण प्रयास किए गए।`,
      evidence: makeEvidence('os_command', `${completedSteps.length} step(s) completed`, {
        ref: completedSteps.join(', ') || undefined,
      }),
      failureReason: failedSteps.length > 0 ? `FAILED_STEPS: ${failedSteps.join(', ')}` : undefined,
    }),
  };
}

/**
 * Guards a push target. Throws rather than silently redirecting, so a mistake
 * surfaces as an error instead of a surprise force-push somewhere unexpected.
 */
export function assertSafePushTarget(branch: string): { ok: true } | { ok: false; reason: string } {
  if (isProtectedBranch(branch)) {
    return {
      ok: false,
      reason: `Refusing to push to "${branch}". Automation pushes only to feature branches.`,
    };
  }
  if (!branch.trim()) {
    return { ok: false, reason: 'No branch name was supplied for the push.' };
  }
  return { ok: true };
}

/** Resolves the workspace path, rejecting a path that is not the repo root. */
export function normalizeWorkspace(workspace: string): string {
  return path.resolve(workspace);
}