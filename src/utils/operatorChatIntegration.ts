/**
 * Hermes JARVIS — live chat integration layer for ComputerOperatorEngine.
 *
 * Small deterministic bridge between the normal JARVIS chat/voice pipeline and the
 * existing computer-operator module. Only commands that the intent classifier labels
 * COMPUTER_OPERATION / RESEARCH are routed here; ordinary conversation stays on
 * the existing backend/offline pipeline. No fake desktop control: without a live
 * bridge adapter the flow reports DESKTOP_CONTROL_NOT_CONFIGURED / SIMULATION_ONLY.
 */

import {
  classifyCommandIntent,
  isCancelCommand,
  planScreenActions,
  executeOperatorTask,
  NotConfiguredScreenOperator,
  redactSecrets,
  type OperatorTask,
  type OperatorRunResult,
  type IntentBundle,
  type OperatorPlanResult,
} from './computerOperatorEngine';

export type OperatorChatDecision =
  | { kind: 'NOT_OPERATOR' }
  | { kind: 'OPERATOR'; classification: IntentBundle; needsApproval: boolean };

const APPROVAL_WORDS: RegExp[] = [
  /^(haan|haan|han|yes|yeah|approve|theek hai|thik hai|kar do|ok|okay)\b/i,
  /(utha lo|jawab do|bhej do|reply karo|kar do|ho jaye)/i,
];
const REJECTION_WORDS: RegExp[] = [
  /^(no|nahi|na|nahin|mat karo|cancel|reject|deny|band karo)\b/i,
  /(mat uthao|mat bhejo|mat karo|nahi karo|rok do)/i,
];

export function isExplicitOperatorApproval(text: string): boolean {
  const t = text.trim().toLowerCase();
  return APPROVAL_WORDS.some((r) => r.test(t));
}

export function isExplicitOperatorRejection(text: string): boolean {
  const t = text.trim().toLowerCase();
  return REJECTION_WORDS.some((r) => r.test(t)) || isCancelCommand(t);
}

export function shouldRouteToOperator(text: string): OperatorChatDecision {
  const classification = classifyCommandIntent(text);
  if (classification.intent === 'COMPUTER_OPERATION' || classification.intent === 'RESEARCH') {
    return { kind: 'OPERATOR', classification, needsApproval: classification.needsApproval };
  }
  // Narrow screen-observation catch for spec phrasings like "Tell me what is displayed on the screen.":
  if (/(screen|display|desktop).{0,30}(what|tell|dekh|batao|show|kya)|(what|tell|dekh|batao|show|kya).{0,30}(screen|display|desktop)/.test(text)) {
    return {
      kind: 'OPERATOR',
      classification: { intent: 'RESEARCH', needsApproval: false, matchingKeywords: ['screen'] },
      needsApproval: false,
    };
  }
 
  return { kind: 'NOT_OPERATOR' };
}

export async function fetchKillSwitchState(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('/api/emergency/status', { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return false;
    const data = await res.json();
    return Boolean(data?.emergencyPaused ?? data?.killSwitchActive ?? false);
  } catch {
    return false;
  }
}

export interface OperatorCredentialState {
  read: boolean;
  control: boolean;
}

/** Default honest capability: no live desktop bridge is connected yet. */
export function resolveOperatorPermissions(profile?: Partial<OperatorCredentialState>): OperatorCredentialState {
  return { read: profile?.read ?? false, control: profile?.control ?? false };
}

export interface PlannedOperatorRun {
  plan: OperatorPlanResult;
  adapter: NotConfiguredScreenOperator;
 
  permissions: OperatorCredentialState;
}

export async function planOperatorRun(goal: string): Promise<PlannedOperatorRun> {
  const permissions = resolveOperatorPermissions();
  const adapter = new NotConfiguredScreenOperator();
  const screen = await adapter.observe();
  const plan = planScreenActions(goal, screen, permissions);
  return { plan, adapter, permissions };
}

export async function executePlannedOperatorRun(
  goal: string,
  run: PlannedOperatorRun,
  options: { taskId: string; killSwitchActive: boolean; cancelCheck?: () => boolean; onProgress?: (t: OperatorTask) => void },
): Promise<OperatorRunResult> {
  // Honest guard: never claim success for an empty/blocked plan.

  if (options.killSwitchActive) {

    return {
      ok: false,
      error: 'GLOBAL_KILL_SWITCH_ACTIVE',
      task: {
        taskId: options.taskId,
        timestamp: new Date().toISOString(),
        intent: classifyCommandIntent(goal).intent,
        status: 'BLOCKED',
        state: null,
        actions: [],
        actionIndex: 0,
        verificationResult: null,
        approvalState: 'REJECTED',
        error: 'GLOBAL_KILL_SWITCH_ACTIVE',
      },
    };
  }
 
  if (run.plan.blockedBy || run.plan.actions.length === 0) {
    const cancelled = options.cancelCheck ? options.cancelCheck() : false;
    if (cancelled) {
      return {
        ok: false,
        error: 'CANCELLED_BY_OWNER',
        task: {
          taskId: options.taskId,
          timestamp: new Date().toISOString(),
          intent: classifyCommandIntent(goal).intent,
          status: 'CANCELLED',
          state: null,
          actions: [],
          actionIndex: 0,
          verificationResult: null,
          approvalState: 'NOT_REQUIRED',
          error: 'CANCELLED_BY_OWNER',
        },
      };
    }
    return {
      ok: false,
      error: run.plan.blockedBy ?? 'ACTION_FAILED_EMPTY_PLAN',
      task: {
        taskId: options.taskId,
        timestamp: new Date().toISOString(),
        intent: classifyCommandIntent(goal).intent,
        status: 'FAILED',
        state: null,
        actions: [],
        actionIndex: 0,
        verificationResult: null,
        approvalState: 'NOT_REQUIRED',
        error: run.plan.blockedBy ?? 'ACTION_FAILED_EMPTY_PLAN',
      },
    };
  }
  return executeOperatorTask(run.adapter, goal, run.plan, {
    taskId: options.taskId,
    killSwitchActive: options.killSwitchActive,
    cancelCheck: options.cancelCheck,
    onProgress: options.onProgress,
  });
}

export function describeOperatorRun(run: PlannedOperatorRun): string {
  if (run.plan.needsApproval) {
    return 'This action requires your approval, Sir — reply HAAN/APPROVE to authorize, or NAHI/CANCEL to deny.';
  }
  if (run.plan.blockedBy) {
    return `COMPUTER OPERATOR • ${redactSecrets(run.plan.blockedBy)}`;
  }
  return `COMPUTER OPERATOR • ${run.plan.actions.length} step plan ${run.plan.actions.every((a) => a.safe) ? '(safe auto-execute)' : '(approval-gated)'}`;
}

export function formatOperatorTaskMessage(task: OperatorTask): string {
  if (task.status === 'COMPLETED') {
    return `COMPUTER OPERATOR • ${redactSecrets(task.finalResult || 'COMPLETED')} • approval: ${task.approvalState}`;
  }
  if (task.status === 'NEEDS_APPROVAL') {
    return 'COMPUTER OPERATOR • APPROVAL REQUIRED, SIR — reply HAAN/APPROVE to authorize, or NAHI/CANCEL to deny.';
  }
  if (task.status === 'CANCELLED' || task.status === 'BLOCKED') {
    return `COMPUTER OPERATOR • ${redactSecrets(task.error || task.status)}`;
  }
  if (task.status === 'FAILED') {
    return `COMPUTER OPERATOR • ${redactSecrets(task.error || 'FAILED')}`;
  }
  return `COMPUTER OPERATOR • ${redactSecrets(task.status)}`;
}

export { redactSecrets };