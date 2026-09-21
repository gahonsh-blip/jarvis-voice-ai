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
//   3. Negation voids consent. "मत करो", "करो मत", "not do it" and
//      "don't do it" are prohibitions, not approvals; matching is whole-token
//      so `करो` cannot fire inside `मत करो`.
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
  'not',
  'never',
  'cancel',
  'stop',
  'abort',
  'never mind',
  'nevermind',
  'nahi',
  'nahin',
  'mat',
  'रुको',
  'नहीं',
  'मत',
  'रद्द',
];

/**
 * Negation particles. A particle *before* an affirmative voids it, so
 * "मत करो" / "mat karo" / "not do it" can never be read as consent. A verb-final
 * Hindi prohibition ("करो मत") is handled by the post-particle set below.
 */
export const NEGATIVE_PARTICLES = [
  'no',
  'not',
  'never',
  'na',
  'nah',
  'nahi',
  'nahin',
  'mat',
  'ना',
  'नहीं',
  'मत',
];

/**
 * Particles that also negate when they *follow* the verb, as Hindi prohibitions
 * commonly do ("करो मत"). Deliberately narrow: "करो ना" means "please do", so
 * `ना` must not appear here.
 */
export const POST_NEGATIVE_PARTICLES = ['mat', 'मत'];

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/don['’]?t\b/g, ' not ')
    .replace(/[.,!?;:।"'“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(normalised: string): string[] {
  return normalised ? normalised.split(' ') : [];
}

/**
 * True when `phrase` occurs as a whole-word run in `tokens`, ignoring any
 * occurrence that a negation particle has voided.
 *
 * `before` voids the match (मत करो, not do it); `after` voids it only for the
 * verb-final Hindi prohibitions (करो मत). Matching whole tokens rather than a
 * substring is what stops `करो` from firing inside `मत करो`.
 */
function containsPhrase(
  tokens: string[],
  phrase: string,
  before: readonly string[],
  after: readonly string[]
): boolean {
  const words = phrase.split(' ');
  for (let i = 0; i + words.length <= tokens.length; i++) {
    let match = true;
    for (let j = 0; j < words.length; j++) {
      if (tokens[i + j] !== words[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    if (i > 0 && before.includes(tokens[i - 1])) continue;
    const end = i + words.length;
    if (end < tokens.length && after.includes(tokens[end])) continue;
    return true;
  }
  return false;
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
  const tokens = tokenize(cleaned);
  if (tokens.length === 0) return 'UNCLEAR';

  const hasYes = AFFIRMATIVE_PHRASES.some((p) =>
    containsPhrase(tokens, p, NEGATIVE_PARTICLES, POST_NEGATIVE_PARTICLES)
  );
  const hasNo = NEGATIVE_PHRASES.some((p) =>
    containsPhrase(tokens, p, [], [])
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