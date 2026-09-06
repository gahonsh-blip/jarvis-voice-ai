// ==============================================================================
// HERMES JARVIS — COMPUTER OPERATOR & SCREEN RESEARCHER TYPE DEFINITIONS
// ==============================================================================

export type HighLevelIntentClass =
  | 'NORMAL_CONVERSATION'
  | 'SPECIAL_COMMAND'
  | 'COMPUTER_OPERATION'
  | 'RESEARCH'
  | 'DANGEROUS_ACTION_REQUIRING_APPROVAL';

export type ComputerActionType =
  | 'MOUSE_MOVE'
  | 'CLICK'
  | 'DOUBLE_CLICK'
  | 'RIGHT_CLICK'
  | 'SCROLL'
  | 'TYPE_TEXT'
  | 'KEY_COMBINATION'
  | 'LAUNCH_APP'
  | 'SWITCH_WINDOW'
  | 'CLOSE_WINDOW'
  | 'TERMINAL_COMMAND'
  | 'READ_FILE'
  | 'EDIT_FILE'
  | 'RUN_TESTS'
  | 'TAKE_SCREENSHOT'
  | 'INSPECT_SCREEN'
  | 'WAIT';

export type ComputerTaskState =
  | 'IDLE'
  | 'COMMAND_RECEIVED'
  | 'ANALYZING_SCREEN'
  | 'PLAN_CREATED'
  | 'ACTION_EXECUTING'
  | 'VERIFYING'
  | 'NEXT_ACTION'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'NEEDS_APPROVAL'
  | 'CANCELLED'
  | 'FAILED';

export type ComputerOperatorMode = 'local' | 'cloud' | 'hybrid';

export interface UIElement {
  id: string;
  type:
    | 'button'
    | 'menu'
    | 'input'
    | 'dialog'
    | 'tab'
    | 'error_badge'
    | 'terminal_line'
    | 'text'
    | 'window_control'
    | 'icon'
    | 'file_item';
  label: string;
  coordinates: { x: number; y: number; width?: number; height?: number };
  app: string;
  enabled: boolean;
  state?: string;
  isDangerous?: boolean;
}

export interface ScreenObservation {
  id: string;
  timestamp: string;
  activeWindow: string;
  activeApplication: string;
  windowTitle: string;
  visibleElements: UIElement[];
  detectedErrors: string[];
  terminalOutput?: string;
  screenResolution: { width: number; height: number };
  screenshotBase64?: string;
  isAmbiguous: boolean;
  ambiguityReason?: string;
  platform: 'windows' | 'linux' | 'darwin' | 'browser';
}

export interface ComputerAction {
  id: string;
  type: ComputerActionType;
  targetApp?: string;
  coordinates?: { x: number; y: number };
  text?: string;
  key?: string;
  command?: string;
  filePath?: string;
  fileDiff?: { target: string; search: string; replacement: string };
  scrollDelta?: { x: number; y: number };
  description: string;
  descriptionHi?: string;
  securityLevel: 1 | 2 | 3 | 4;
  requiresHumanApproval: boolean;
  dangerReason?: string;
}

export interface VerificationResult {
  verified: boolean;
  stateChangeDetected: boolean;
  message: string;
  messageHi?: string;
  currentStepIndex: number;
  shouldRetry: boolean;
  retryCount: number;
  maxRetries: number;
  error?: string;
}

export interface ComputerOperatorPlan {
  id: string;
  objective: string;
  objectiveHi?: string;
  currentStepIndex: number;
  steps: ComputerAction[];
  createdAt: string;
}

export interface CommandStreamEvent {
  id: string;
  taskId: string;
  timestamp: string;
  stage:
    | 'COMMAND_RECEIVED'
    | 'ANALYZING_SCREEN'
    | 'PLAN_CREATED'
    | 'ACTION'
    | 'VERIFYING'
    | 'RESULT'
    | 'NEXT_ACTION'
    | 'COMPLETED'
    | 'BLOCKED'
    | 'NEEDS_APPROVAL'
    | 'CANCELLED';
  message: string;
  messageHi?: string;
  actionDetail?: Partial<ComputerAction>;
  verification?: Partial<VerificationResult>;
  error?: string;
  approvalRequired?: boolean;
}

export interface ComputerOperatorTask {
  taskId: string;
  objective: string;
  objectiveHi?: string;
  createdAt: string;
  updatedAt: string;
  intentClass: HighLevelIntentClass;
  mode: ComputerOperatorMode;
  status: ComputerTaskState;
  currentObservation?: ScreenObservation;
  plan?: ComputerOperatorPlan;
  currentAction?: ComputerAction;
  lastVerification?: VerificationResult;
  streamEvents: CommandStreamEvent[];
  error?: string;
  approvalId?: string;
  resultSummary?: string;
  resultSummaryHi?: string;
}

export interface ComputerOperatorConfig {
  mode: ComputerOperatorMode;
  maxRetriesPerAction: number;
  actionDelayMs: number;
  safetyTimeoutMs: number;
  requireHumanApprovalLevel4: boolean;
  redactSensitiveData: boolean;
  defaultApplication: 'vscode' | 'browser' | 'terminal' | 'desktop';
}

export const DEFAULT_OPERATOR_CONFIG: ComputerOperatorConfig = {
  mode: 'hybrid',
  maxRetriesPerAction: 3,
  actionDelayMs: 400,
  safetyTimeoutMs: 30000,
  requireHumanApprovalLevel4: true,
  redactSensitiveData: true,
  defaultApplication: 'desktop',
};
