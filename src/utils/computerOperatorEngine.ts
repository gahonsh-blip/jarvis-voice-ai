/**
 * Hermes JARVIS Computer Operator + Screen Researcher engine.
 *
 * Pure, local-first, deterministic core with an adapter seam for real
 * desktop control. Everything is observability-owned, cancellable,
 * permission-gated, and strictly typed. No fake success.
 */

export type OperatorIntent =
  | 'NORMAL_CONVERSATION'
  | 'SPECIAL_COMMAND'
  | 'COMPUTER_OPERATION'
  | 'RESEARCH'
  | 'DANGEROUS_ACTION_REQUIRING_APPROVAL';

export interface IntentBundle {
  intent: OperatorIntent;
  needsApproval: boolean;
  dangerousReason?: string;
  matchingKeywords: string[];
}

export type OperatorMode = 'local' | 'cloud' | 'hybrid';

export interface ScreenElement {
  id: string;
  type: 'button' | 'link' | 'field' | 'menu' | 'tab' | 'dialog' | 'text' | 'icon';
  x: number;
  y: number;
  width?: number;
  height?: number;
  text?: string;
  role?: string;
  state?: 'visible' | 'disabled' | 'selected' | 'error';
}

export interface ScreenState {
  id: string;
  windowTitle?: string;
  elements: ScreenElement[];
  rawText?: string;
  visibleErrors: string[];
  dialogs: string[];
  ambiguous: boolean;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  screenshot?: string;
}

export interface VerificationResult {
  ok: boolean;
  detail: string;
}

export interface ScreenOperatorAdapter {
  readonly simulationOnly: boolean;
  observe(): Promise<ScreenState>;
  act(action: OperatorAction): Promise<ActionResult>;
  verify(after: ScreenState): Promise<VerificationResult>;
}

export type OperatorActionType =
  | 'click'
  | 'dblclick'
  | 'rightclick'
  | 'scroll'
  | 'type'
  | 'key'
  | 'open'
  | 'screenshot'
  | 'read'
  | 'wait';

export interface OperatorAction {
  type: OperatorActionType;
  targetId?: string;
  targetText?: string;
  value?: string;
  key?: string;
  safe: boolean;
  description: string;
}

export type ApprovalState =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED';

export interface OperatorTask {
  taskId: string;
  timestamp: string;
  intent: OperatorIntent;
  status: 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'BLOCKED' | 'CANCELLED' | 'FAILED' | 'NEEDS_APPROVAL';
  state: ScreenState | null;
  actions: OperatorAction[];
  actionIndex: number;
  verificationResult: VerificationResult | null;
  error?: string;
  approvalState: ApprovalState;
  finalResult?: string;
}

export type OperatorTaskStatus = OperatorTask['status'];

const DANGEROUS_WORDS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'message', pattern: /(send|reply|bhej|jawab)(.{0,20}(message|msg|text|sms))?|(message|msg|text|sms)(.{0,20}(send|reply|bhej|jawab))/i },
  { key: 'call', pattern: /(call the|answer the call|pick up).{0,20}(call|phone)|call number/i },
  { key: 'post', pattern: /(post|publish|upload|share).{0,20}(social|youtube|instagram|linkedin|telegram)|(social|youtube|instagram|linkedin|telegram).{0,20}(post|publish|upload|share)/i },
  { key: 'delete', pattern: /(delete|remove).{0,20}(file|folder|project|database)|(file|folder|project|database).{0,20}(delete|remove)/i },
];
const OPERATOR_WORDS: RegExp[] = [
  /(open|launch|start|run|kholo|khol do).{0,60}(app|application|project|editor|browser|chrome|edge|terminal|vs code|vscode|code|window|file|folder)|(app|application|project|editor|browser|chrome|edge|terminal|vs code|vscode).{0,60}(open|launch|start|run|kholo|khol do)/i,
  /(screen|desktop|window|observe|inspect|look|see|watch|dekh|dekhkar).{0,40}(error|bug|issue|problem|status|kya|kya hua)/i,
  /(click|dblclick|scroll|type).{0,30}(button|field|link|icon|menu|tab|element)/i,
  /(fix kar|theek kar|error fix|solve|resolve|sambhal).{0,40}(error|bug|issue|problem)={0,20}/i,
  /(screenshot|capture).{0,20}(screen|page|window)|screen.{0,20}(batao|dekh)/i,
];
const SPECIAL_PREFIXES: RegExp[] = [
  /^\/[a-z]/i,
  /^(aaj ka |aaj ki |today's )?(weather|time|mausam|samay)/i,
  /^(location|memory|briefing|telegram|youtube|studio|call|note|calculator|paint|browser|settings|permission|weather)/i,
];
const CANCEL_WORDS: RegExp[] = [
  /^(stop|cancel|halt|abort|αñ░αÑüαñò|αñ░αÑéαñò|αñòαñ╛αñ« αñ¼αñéαñª|αñ¼αñéαñª αñòαñ░αÑï|αñáαñ╣αñ░αÑï)/i,
];

export function isCancelCommand(text: string): boolean {
  const t = text.trim().toLowerCase();
  return CANCEL_WORDS.some((r) => r.test(t));
}

export function detectDangerousIntent(text: string): { dangerous: boolean; reason?: string; keywords: string[] } {
  const hit = DANGEROUS_WORDS.find((d) => d.pattern.test(text));
  return hit
    ? { dangerous: true, reason: hit.key, keywords: [hit.key] }
    : { dangerous: false, keywords: [] };
}

export function classifyCommandIntent(text: string): IntentBundle {
  const dangerous = detectDangerousIntent(text);
  if (dangerous.dangerous) {
    return {
      intent: 'DANGEROUS_ACTION_REQUIRING_APPROVAL',
      needsApproval: true,
      dangerousReason: dangerous.reason,
      matchingKeywords: dangerous.keywords,
    };
  }

  if (SPECIAL_PREFIXES.some((r) => r.test(text))) {
    return { intent: 'SPECIAL_COMMAND', needsApproval: false, matchingKeywords: [] };
  }

  const opMatch = OPERATOR_WORDS.filter((r) => r.test(text));
  if (opMatch.length > 0) {
    return {
      intent: /(error|bug|fix|αñ╕αñ«αñ╕αÑìαñ»αñ╛|αñ╕αÑüαñºαñ╛αñ░αÑï)/i.test(text) ? 'RESEARCH' : 'COMPUTER_OPERATION',
      needsApproval: false,
      matchingKeywords: opMatch.map((r) => r.source),
    };
  }

  if (/(research|search|investigate|lookup|αñûαÑïαñ£|αñ╢αÑïαñº|αñ£αñ╛αñ¿αñòαñ╛αñ░αÑÇ|research αñòαñ░αÑï)/i.test(text)) {
    return { intent: 'RESEARCH', needsApproval: false, matchingKeywords: ['research'] };
  }

  return { intent: 'NORMAL_CONVERSATION', needsApproval: false, matchingKeywords: [] };
}

export function resolveOperatorMode(preferred?: OperatorMode): OperatorMode {
  return preferred || 'hybrid';
}

const SECRET_PATTERN = /((api[_-]?key|oauth[_-]?token|access[_-]?token|password|passcode|pin|cvv|bearer)[^\s,]{0,50})|(\beyJ[a-zA-Z0-9_-]{10,}\.[^\s]{10,}\.[^\s]{10,}\b)|(\b[A-Za-z0-9+/]{40,}={0,2}\b)/gi;

export function redactSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, '[REDACTED]');
}

const MAX_PLAN_STEPS = 8;
const OPERATOR_TASK_KEY = 'hermes_jarvis_operator_tasks_v1';
const OPERATOR_AUDIT_KEY = 'hermes_jarvis_operator_audit_v1';

export interface OperatorRunOptions {
  taskId: string;
  maxSteps?: number;
  timeoutMs?: number;
  killSwitchActive: boolean;
  cancelCheck?: () => boolean;
  onProgress?: (task: OperatorTask) => void;
}

export type OperatorRunResult =
  | { ok: true; task: OperatorTask }
  | { ok: false; error: string; task: OperatorTask };

export class SimulatedScreenAdapter implements ScreenOperatorAdapter {
  readonly simulationOnly = true;
  private clickCount = 0;
  constructor(private state: ScreenState) {}
  async observe(): Promise<ScreenState> {
    return this.state;
  }
  async act(action: OperatorAction): Promise<ActionResult> {
    if (action.type === 'click') {
      this.clickCount += 1;
      return { ok: true, message: 'SIMULATION_ONLY: clicked ' + (action.targetId || action.type) };
    }
    return { ok: true, message: 'SIMULATION_ONLY: executed ' + action.type };
  }
  async verify(after: ScreenState): Promise<VerificationResult> {
    return { ok: !after.ambiguous, detail: after.ambiguous ? 'SIMULATION_ONLY: ambiguous screen' : 'SIMULATION_ONLY: stable screen' };
  }
  getClickCount(): number {
    return this.clickCount;
  }
}
export class NotConfiguredScreenOperator implements ScreenOperatorAdapter {
  readonly simulationOnly = false;
  async observe(): Promise<ScreenState> {
    return {
      id: 'no-desktop-bridge',
      elements: [],
      visibleErrors: ['DESKTOP_CONTROL_NOT_CONFIGURED'],
      dialogs: [],
      ambiguous: false,
    };
  }
  async act(): Promise<ActionResult> {
    return { ok: false, message: 'DESKTOP_CONTROL_NOT_CONFIGURED: no live desktop bridge is connected' };
  }
  async verify(): Promise<VerificationResult> {
    return { ok: false, detail: 'DESKTOP_CONTROL_NOT_CONFIGURED' };
  }
}

function hasOperatorStorage(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

export function loadOperatorTasks(): OperatorTask[] {
  if (!hasOperatorStorage()) return [];
  try {
    const raw = localStorage.getItem(OPERATOR_TASK_KEY);
    return raw ? (JSON.parse(raw) as OperatorTask[]) : [];
  } catch {
    return [];
  }
}

export function saveOperatorTask(task: OperatorTask): void {
  if (!hasOperatorStorage()) return;
  try {
    const list = loadOperatorTasks().filter((t) => t.taskId !== task.taskId);
    list.unshift(task);
    localStorage.setItem(OPERATOR_TASK_KEY, JSON.stringify(list.slice(0, 20)));
  } catch {}
}

export function recordOperatorAudit(task: OperatorTask): void {
  if (!hasOperatorStorage()) return;
  try {
    const raw = localStorage.getItem(OPERATOR_AUDIT_KEY);
    const list: Record<string, unknown>[] = raw ? (JSON.parse(raw) as Record<string, unknown>[]) : [];
    list.unshift({
      taskId: task.taskId,
      timestamp: task.timestamp,
      intent: task.intent,
      status: task.status,
      approvalState: task.approvalState,
      steps: task.actions.length,
      error: task.error ? redactSecrets(task.error) : undefined,
    });
    localStorage.setItem(OPERATOR_AUDIT_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {}
}

export interface OperatorPlanResult {
  actions: OperatorAction[];
  blockedBy?: string;
  needsApproval: boolean;
}

export function planScreenActions(
  goal: string,
  screen: ScreenState,
  permissions: { read: boolean; control: boolean },
): OperatorPlanResult {
  if (!permissions.read) {
    return { actions: [], blockedBy: 'SCREEN_READ_PERMISSION_REQUIRED', needsApproval: false };
  }
  if (screen.ambiguous) {
    return { actions: [], blockedBy: 'AMBIGUOUS_SCREEN_STOP', needsApproval: false };
  }
  const actions: OperatorAction[] = [];
  if (screen.visibleErrors.length > 0) {
    actions.push({ type: 'read', targetText: screen.visibleErrors[0], safe: true, description: 'Read visible error' });
    actions.push({ type: 'screenshot', safe: true, description: 'Capture current screen' });
  }
  const goalLower = goal.toLowerCase();
  if (/open|launch|start|run|kholo|khol do|khol/.test(goalLower)) {

    const target = screen.elements.find((e) => e.type === 'icon' || e.type === 'link');
    if (target) {
      actions.push({ type: 'click', targetId: target.id, safe: false, description: 'Open requested target' });
    } else {
      actions.push({ type: 'open', targetText: goal, safe: false, description: 'Open requested application' });
    }
  }
  if (/fix|error|bug/.test(goalLower)) {
    const err = screen.elements.find((e) => e.state === 'error' || e.type === 'dialog');
    if (err) {
      actions.push({ type: 'click', targetId: err.id, safe: true, description: 'Focus error dialog' });
    }
  }
  if (actions.length === 0) {
    actions.push({ type: 'read', safe: true, description: 'Inspect current screen' });
  }
  const safe = actions.every((a) => a.safe);
  const needsApproval = !permissions.control && !safe;
  return {
    actions: actions.slice(0, MAX_PLAN_STEPS),
    needsApproval: needsApproval
  };
}
export async function executeOperatorTask(
  adapter: ScreenOperatorAdapter,
  goal: string,
  plan: OperatorPlanResult,
  options: OperatorRunOptions,
): Promise<OperatorRunResult> {
  const task: OperatorTask = {
    taskId: options.taskId,
    timestamp: new Date().toISOString(),
    intent: classifyCommandIntent(goal).intent,
    status: 'PLANNED',
    state: null,
    actions: plan.actions,
    actionIndex: 0,
    verificationResult: null,
    approvalState: plan.needsApproval ? 'PENDING' : 'NOT_REQUIRED',
  };
  if (options.killSwitchActive) {
    task.status = 'BLOCKED';
    task.error = 'GLOBAL_KILL_SWITCH_ACTIVE';
    task.approvalState = 'REJECTED';
    saveOperatorTask(task);
    recordOperatorAudit(task);
    return { ok: false, error: task.error, task };
  }
  if (plan.needsApproval) {
    task.status = 'NEEDS_APPROVAL';
    saveOperatorTask(task);
    recordOperatorAudit(task);
    return { ok: false, error: 'APPROVAL_REQUIRED', task };
  }
  task.status = 'RUNNING';
  saveOperatorTask(task);
  const maxSteps = options.maxSteps ?? Math.min(plan.actions.length, 8);
  for (let step = 0; step < maxSteps; step++) {
    const cancel = options.cancelCheck ? options.cancelCheck() : false;
    if (cancel) {
      task.status = 'CANCELLED';
      task.error = 'CANCELLED_BY_OWNER';
      saveOperatorTask(task);
      recordOperatorAudit(task);
      return { ok: false, error: task.error, task };
    }
    task.actionIndex = step;
    saveOperatorTask(task);
    const before = await adapter.observe();
    task.state = before;
    const action = plan.actions[step];
    if (!action) break;
    const result = await adapter.act(action);
    if (!result.ok) {
      task.status = 'FAILED';
      task.error = 'ACTION_FAILED' + '_' + action.type;
      saveOperatorTask(task);
      recordOperatorAudit(task);
      return { ok: false, error: task.error, task };
    }
    const after = await adapter.observe();
    const verification = await adapter.verify(after);
    task.verificationResult = verification;
    if (!verification.ok) {
      task.status = 'FAILED';
      task.error = 'VERIFICATION_FAILED' + '_' + action.type;
      saveOperatorTask(task);
      recordOperatorAudit(task);
      return { ok: false, error: task.error, task };
    }
    if (options.onProgress) {
      options.onProgress(task);
    }
  }
  task.status = 'COMPLETED';
  task.finalResult = 'COMPLETED' + '_' + String(plan.actions.length) + '_STEPS';
  saveOperatorTask(task);
  recordOperatorAudit(task);
  return { ok: true, task };
}
