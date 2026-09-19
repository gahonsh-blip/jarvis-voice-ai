// ==============================================================================
// HERMES JARVIS — CONTINUOUS VOICE SESSION (backlog items 46-48)
//
// The state machine behind hands-free interaction. It decides what the mic is
// for at any moment and which spoken phrase counts as confirmation.
//
// The browser API calls live in the UI; everything decidable is here so it can
// be tested without a microphone. Two rules matter most:
//
//   1. A wake word only opens a window. It never by itself runs a command, and
//      the window closes on its own so a forgotten session stops listening.
//   2. Destructive or external actions require a spoken confirmation. Anything
//      that is not a clear yes is treated as not-confirmed: silence, an unclear
//      reply, and an explicit no all take the same safe path. A command is
//      never executed on an ambiguous answer.
// ==============================================================================

export type VoiceSessionState =
  | 'IDLE'
  | 'AWAITING_WAKE'
  | 'LISTENING'
  | 'CONFIRMING'
  | 'PROCESSING';

export interface VoiceSessionConfig {
  /** How long the mic stays open after a wake word, in ms. */
  commandWindowMs?: number;
  /** How long a confirmation prompt waits for an answer, in ms. */
  confirmWindowMs?: number;
}

export const DEFAULT_COMMAND_WINDOW_MS = 8000;
export const DEFAULT_CONFIRM_WINDOW_MS = 6000;

/** Spoken phrases that count as a yes. Anything else is not consent. */
export const AFFIRMATIVE_PHRASES = [
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'ok',
  'okay',
  'do it',
  'go ahead',
  'proceed',
  'confirm',
  'confirmed',
  'haan',
  'han',
  'ha',
  'theek hai',
  'thik hai',
  'karo',
  'kar do',
  'हाँ',
  'हां',
  'ठीक है',
  'करो',
  'कर दो',
];

/** Spoken phrases that count as a no. */
export const NEGATIVE_PHRASES = [
  'no',
  'nope',
  'nah',
  'cancel',
  'stop',
  'abort',
  "don't",
  'dont',
  'never mind',
  'nevermind',
  'nahi',
  'nahin',
  'रुको',
  'नहीं',
  'रद्द',
];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:।"'“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type ConfirmationVerdict = 'CONFIRMED' | 'DECLINED' | 'UNCLEAR';

/**
 * Interprets a spoken reply to a confirmation prompt.
 *
 * A transcript that contains both a yes and a no is UNCLEAR, not CONFIRMED:
 * "yes, no wait" must not be read as permission.
 */
export function interpretConfirmation(transcript: string): ConfirmationVerdict {
  const cleaned = normalise(transcript);
  if (!cleaned) return 'UNCLEAR';

  const hasYes = AFFIRMATIVE_PHRASES.some(
    (p) => new RegExp(`(?:^|\\s)${p}(?:\\s|$)`, 'i').test(cleaned)
  );
  const hasNo = NEGATIVE_PHRASES.some(
    (p) => new RegExp(`(?:^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i').test(cleaned)
  );

  if (hasYes && hasNo) return 'UNCLEAR';
  if (hasNo) return 'DECLINED';
  if (hasYes) return 'CONFIRMED';
  return 'UNCLEAR';
}

/**
 * Whether a command needs spoken confirmation before it runs.
 *
 * Destructive, external-facing, and irreversible actions need it. Read-only
 * questions do not, or the assistant would be tedious to use.
 */
export function requiresVoiceConfirmation(command: string): boolean {
  const cleaned = normalise(command);
  const risky = [
    // destructive / local changes
    'delete', 'remove', 'uninstall', 'format', 'overwrite', 'wipe', 'clear all',
    'shutdown', 'shut down', 'restart', 'reboot', 'kill',
    // external / irreversible
    'send', 'post', 'publish', 'tweet', 'email', 'message', 'call', 'transfer', 'pay',
    // code and repository changes
    'push', 'commit', 'merge', 'deploy', 'revert',
    // Hindi equivalents
    'mita', 'mitado', 'delete kar', 'bhej', 'bhejo', 'post kar', 'call kar',
    'मिटा', 'भेज', 'भेजो', 'कॉल', 'बंद', 'हटा',
  ];
  return risky.some((k) => cleaned.includes(k));
}

export interface VoiceSessionSnapshot {
  state: VoiceSessionState;
  /** The command held pending confirmation, if any. */
  pendingCommand: string | null;
  /** Why the last transition happened, for the status line. */
  reason: string;
}

/**
 * A testable model of the voice session. The UI drives it with real recogniser
 * events; this class owns the decisions.
 */
export class VoiceSession {
  private state: VoiceSessionState = 'IDLE';
  private pendingCommand: string | null = null;
  private reason = 'Initialised.';
  private readonly config: Required<VoiceSessionConfig>;

  constructor(config: VoiceSessionConfig = {}) {
    this.config = {
      commandWindowMs: config.commandWindowMs ?? DEFAULT_COMMAND_WINDOW_MS,
      confirmWindowMs: config.confirmWindowMs ?? DEFAULT_CONFIRM_WINDOW_MS,
    };
  }

  get snapshot(): VoiceSessionSnapshot {
    return { state: this.state, pendingCommand: this.pendingCommand, reason: this.reason };
  }

  get commandWindowMs(): number {
    return this.config.commandWindowMs;
  }

  get confirmWindowMs(): number {
    return this.config.confirmWindowMs;
  }

  /** Hands-free mode enabled: the mic waits for a wake word. */
  awaitWakeWord(): VoiceSessionSnapshot {
    this.state = 'AWAITING_WAKE';
    this.pendingCommand = null;
    this.reason = 'Awaiting wake word.';
    return this.snapshot;
  }

  /** Wake word heard with no command attached: open the listening window. */
  wakeDetected(): VoiceSessionSnapshot {
    this.state = 'LISTENING';
    this.pendingCommand = null;
    this.reason = 'Wake word detected; listening for a command.';
    return this.snapshot;
  }

  /**
   * A command arrived. Returns whether it may run now, or whether a spoken
   * confirmation is needed first.
   */
  commandHeard(command: string): { action: 'EXECUTE' | 'CONFIRM'; command: string; snapshot: VoiceSessionSnapshot } {
    const trimmed = command.trim();
    if (!trimmed) {
      this.state = 'LISTENING';
      this.reason = 'Empty command ignored.';
      return { action: 'CONFIRM', command: '', snapshot: this.snapshot };
    }

    if (requiresVoiceConfirmation(trimmed)) {
      this.state = 'CONFIRMING';
      this.pendingCommand = trimmed;
      this.reason = 'Command is sensitive; awaiting spoken confirmation.';
      return { action: 'CONFIRM', command: trimmed, snapshot: this.snapshot };
    }

    this.state = 'PROCESSING';
    this.pendingCommand = null;
    this.reason = 'Command accepted.';
    return { action: 'EXECUTE', command: trimmed, snapshot: this.snapshot };
  }

  /**
   * A reply to a confirmation prompt. Only a clear yes approves; everything
   * else leaves the command unexecuted.
   */
  confirmationHeard(transcript: string): {
    verdict: ConfirmationVerdict;
    command: string | null;
    snapshot: VoiceSessionSnapshot;
  } {
    if (this.state !== 'CONFIRMING' || !this.pendingCommand) {
      this.reason = 'No command was awaiting confirmation.';
      return { verdict: 'UNCLEAR', command: null, snapshot: this.snapshot };
    }

    const verdict = interpretConfirmation(transcript);

    if (verdict === 'CONFIRMED') {
      const command = this.pendingCommand;
      this.pendingCommand = null;
      this.state = 'PROCESSING';
      this.reason = 'Confirmed by the operator.';
      return { verdict, command, snapshot: this.snapshot };
    }

    if (verdict === 'DECLINED') {
      this.pendingCommand = null;
      this.state = 'LISTENING';
      this.reason = 'Declined by the operator; command not executed.';
      return { verdict, command: null, snapshot: this.snapshot };
    }

    // UNCLEAR: keep waiting rather than executing or discarding outright.
    this.reason = 'Reply was not a clear yes or no; command still not executed.';
    return { verdict, command: null, snapshot: this.snapshot };
  }

  /** The confirmation window elapsed with no clear answer. */
  confirmationTimedOut(): VoiceSessionSnapshot {
    if (this.state !== 'CONFIRMING') return this.snapshot;
    this.pendingCommand = null;
    this.state = 'LISTENING';
    this.reason = 'Confirmation timed out; command not executed.';
    return this.snapshot;
  }

  /** The command window elapsed. Returns to waiting for a wake word. */
  commandWindowElapsed(): VoiceSessionSnapshot {
    if (this.state === 'AWAITING_WAKE') return this.snapshot;
    this.state = 'AWAITING_WAKE';
    this.pendingCommand = null;
    this.reason = 'Listening window closed.';
    return this.snapshot;
  }

  /** The user turned the mic off or the session ended. */
  reset(): VoiceSessionSnapshot {
    this.state = 'IDLE';
    this.pendingCommand = null;
    this.reason = 'Session ended.';
    return this.snapshot;
  }
}