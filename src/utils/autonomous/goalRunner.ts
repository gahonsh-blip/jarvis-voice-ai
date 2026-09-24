// ==============================================================================
// HERMES JARVIS — AUTONOMOUS GOAL RUNNER (backlog items 40-45)
//
// The goal → plan → execute → verify loop, with recovery and human checkpoints.
//
// The runner executes one step at a time, checks the result before moving on,
// and retries a failed step only when the failure is marked retryable. When a
// step needs a human decision it stops and asks; it never assumes consent.
// Every transition is written to an audit trail on the run itself.
//
// The central rule: a step is DONE only when its own verifier confirms it. A
// step that fell back to a simulation is recorded as SIMULATION_ONLY and the
// run's overall outcome reflects that — it can never end as VERIFIED.
// ==============================================================================

import {
  buildReceipt,
  makeEvidence,
  type ExecutionOutcome,
  type ExecutionReceipt,
} from '../executionTruth';

export type StepStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'DONE'
  | 'FAILED'
  | 'SKIPPED'
  | 'AWAITING_APPROVAL';

export interface GoalStep {
  id: string;
  description: string;
  /** Side effect the step performs. Receives the run's shared state. */
  execute: (state: Record<string, unknown>) => Promise<unknown>;
  /**
   * Confirms the step actually happened. Returning a receipt lets the step
   * declare its own outcome; returning a boolean is a convenience for local
   * checks. If omitted the step can never be recorded as DONE.
   */
  verify?: (
    result: unknown,
    state: Record<string, unknown>,
  ) => Promise<boolean | ExecutionReceipt> | boolean | ExecutionReceipt;
  /** Step cannot start until a human approves it. */
  requiresApproval?: boolean;
  /** Safe to retry on failure. Defaults to false — retrying is opt-in. */
  retryable?: boolean;
  /** Maximum attempts including the first. Ignored unless retryable. */
  maxAttempts?: number;
}

export interface AuditEntry {
  at: string;
  stepId: string;
  event:
    | 'STEP_STARTED'
    | 'STEP_SUCCEEDED'
    | 'STEP_FAILED'
    | 'STEP_RETRYING'
    | 'STEP_SKIPPED'
    | 'APPROVAL_REQUESTED'
    | 'APPROVAL_DECIDED'
    | 'RUN_FINISHED';
  detail: string;
  attempt?: number;
}

export interface GoalRunResult {
  goal: string;
  outcome: ExecutionOutcome;
  verified: boolean;
  steps: Array<{
    id: string;
    description: string;
    status: StepStatus;
    attempts: number;
    detail: string;
  }>;
  audit: AuditEntry[];
  receipt: ExecutionReceipt;
  /** True when the run stopped early because a human decision is needed. */
  awaitingApproval?: boolean;
}

export interface GoalRunOptions {
  /**
   * Human checkpoint. Called for steps marked requiresApproval. Returning false
   * skips the step. When omitted, an approval-gated step is never executed —
   * the run pauses and reports awaitingApproval.
   */
  approve?: (step: GoalStep, goal: string) => Promise<boolean> | boolean;
  /** Optional observer for progress reporting. */
  onAudit?: (entry: AuditEntry) => void;
  now?: () => Date;
}

export class AutonomousGoalRunner {
  private readonly options: GoalRunOptions;
  private readonly now: () => Date;

  constructor(options: GoalRunOptions = {}) {
    this.options = options;
    this.now = options.now ?? (() => new Date());
  }

  async run(goal: string, steps: GoalStep[]): Promise<GoalRunResult> {
    const state: Record<string, unknown> = {};
    const audit: AuditEntry[] = [];
    const results: GoalRunResult['steps'] = [];

    const record = (entry: Omit<AuditEntry, 'at'>) => {
      const full: AuditEntry = { at: this.now().toISOString(), ...entry };
      audit.push(full);
      this.options.onAudit?.(full);
    };

    let pausedForApproval = false;

    for (const step of steps) {
      if (pausedForApproval) {
        results.push({
          id: step.id,
          description: step.description,
          status: 'PENDING',
          attempts: 0,
          detail: 'Not started: an earlier step is awaiting approval.',
        });
        continue;
      }

      if (step.requiresApproval) {
        record({
          stepId: step.id,
          event: 'APPROVAL_REQUESTED',
          detail: `Step requires human approval: ${step.description}`,
        });

        if (!this.options.approve) {
          // No human channel is wired up. Stop rather than assume consent.
          pausedForApproval = true;
          results.push({
            id: step.id,
            description: step.description,
            status: 'AWAITING_APPROVAL',
            attempts: 0,
            detail: 'No approval channel is configured, so this step was not executed.',
          });
          record({
            stepId: step.id,
            event: 'APPROVAL_DECIDED',
            detail: 'No approval channel available; step not executed.',
          });
          continue;
        }

        const approved = await this.options.approve(step, goal);
        record({
          stepId: step.id,
          event: 'APPROVAL_DECIDED',
          detail: approved ? 'Human approved the step.' : 'Human rejected the step.',
        });

        if (!approved) {
          results.push({
            id: step.id,
            description: step.description,
            status: 'SKIPPED',
            attempts: 0,
            detail: 'Rejected by human approval.',
          });
          record({ stepId: step.id, event: 'STEP_SKIPPED', detail: 'Rejected by human approval.' });
          continue;
        }
      }

      const maxAttempts = step.retryable ? Math.max(1, step.maxAttempts ?? 2) : 1;
      let attempt = 0;
      let finalStatus: StepStatus = 'FAILED';
      let finalDetail = 'Step did not run.';

      while (attempt < maxAttempts) {
        attempt += 1;
        record({
          stepId: step.id,
          event: 'STEP_STARTED',
          detail: `Attempt ${attempt} of ${maxAttempts}: ${step.description}`,
          attempt,
        });

        try {
          const result = await step.execute(state);

          if (!step.verify) {
            // Without a verifier there is no way to know this worked. Report it
            // honestly instead of assuming success.
            finalStatus = 'FAILED';
            finalDetail =
              'Step produced a result but defines no verifier, so it cannot be confirmed.';
            record({
              stepId: step.id,
              event: 'STEP_FAILED',
              detail: finalDetail,
              attempt,
            });
            break;
          }

          const verification = await step.verify(result, state);

          if (typeof verification !== 'boolean' && verification.outcome === 'SIMULATION_ONLY') {
            finalStatus = 'FAILED';
            finalDetail =
              verification.detailEn || 'Step only produced simulated output, which is not success.';
            record({ stepId: step.id, event: 'STEP_FAILED', detail: finalDetail, attempt });
            break;
          }

          const verified =
            typeof verification === 'boolean'
              ? verification
              : verification.outcome === 'VERIFIED';

          if (verified) {
            state[step.id] = result;
            finalStatus = 'DONE';
            finalDetail =
              typeof verification === 'boolean'
                ? 'Verified by the step verifier.'
                : verification.detailEn;
            record({ stepId: step.id, event: 'STEP_SUCCEEDED', detail: finalDetail, attempt });
            break;
          }

          finalStatus = 'FAILED';
          finalDetail =
            typeof verification === 'boolean'
              ? 'Verifier reported the step did not take effect.'
              : verification.detailEn;
          record({ stepId: step.id, event: 'STEP_FAILED', detail: finalDetail, attempt });
        } catch (err: any) {
          finalStatus = 'FAILED';
          finalDetail = `Step threw: ${err?.message || String(err)}`;
          record({ stepId: step.id, event: 'STEP_FAILED', detail: finalDetail, attempt });
        }

        if (attempt < maxAttempts) {
          record({
            stepId: step.id,
            event: 'STEP_RETRYING',
            detail: `Retrying after failure: ${finalDetail}`,
            attempt,
          });
        }
      }

      results.push({
        id: step.id,
        description: step.description,
        status: finalStatus,
        attempts: attempt,
        detail: finalDetail,
      });

      if (finalStatus === 'FAILED') {
        // A failed step invalidates everything after it, so stop rather than
        // running dependent steps against a state that was never produced. The
        // remaining steps are still listed so the report shows the full plan.
        for (const remaining of steps.slice(steps.indexOf(step) + 1)) {
          results.push({
            id: remaining.id,
            description: remaining.description,
            status: 'PENDING',
            attempts: 0,
            detail: 'Not started: an earlier step failed.',
          });
        }
        break;
      }
    }

    const doneCount = results.filter((s) => s.status === 'DONE').length;
    const failed = results.filter((s) => s.status === 'FAILED');
    const waiting = results.filter((s) => s.status === 'AWAITING_APPROVAL');

    let outcome: ExecutionOutcome;
    if (failed.length > 0) {
      outcome = 'FAILED';
    } else if (waiting.length > 0 || results.some((s) => s.status === 'PENDING')) {
      outcome = 'DISPATCHED';
    } else {
      outcome = 'VERIFIED';
    }

    record({
      stepId: '*',
      event: 'RUN_FINISHED',
      detail: `Run finished with outcome ${outcome}: ${doneCount} of ${steps.length} step(s) done.`,
    });

    return {
      goal,
      outcome,
      verified: outcome === 'VERIFIED',
      steps: results,
      audit,
      awaitingApproval: waiting.length > 0,
      receipt: buildReceipt({
        action: 'autonomous.goalRun',
        target: goal,
        outcome,
        detailEn:
          outcome === 'VERIFIED'
            ? `All ${steps.length} step(s) completed and verified.`
            : failed.length > 0
              ? `Stopped after ${doneCount} of ${steps.length} step(s): ${failed[0].detail}`
              : `Paused for approval after ${doneCount} of ${steps.length} step(s).`,
        detailHi:
          outcome === 'VERIFIED'
            ? `सभी ${steps.length} चरण पूर्ण एवं सत्यापित।`
            : `लक्ष्य पूर्ण नहीं हुआ — ${doneCount} चरण पूर्ण हुए।`,
        evidence:
          outcome === 'VERIFIED'
            ? makeEvidence('os_command', `Every one of ${steps.length} step(s) passed its own verifier.`, {
                ref: `${doneCount}/${steps.length} steps verified`,
              })
            : null,
        failureReason: failed.length > 0 ? failed[0].detail : undefined,
      }),
    };
  }
}