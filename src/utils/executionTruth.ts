// ==============================================================================
// HERMES JARVIS — EXECUTION TRUTH VOCABULARY
//
// Single source of truth for "did this action actually happen?".
//
// A remote action (answer a call on a phone, send a message, publish a post) can
// only be VERIFIED when the remote system confirms it. Until that confirmation
// arrives the action is DISPATCHED — never success. Local actions are verified
// against real OS evidence (a file that exists, a command's exit status).
//
// The verbs here exist so no module has to invent its own success story.
// ==============================================================================

export const EXECUTION_OUTCOMES = [
  /** Not set up yet by the operator (missing config / credentials). */
  'NOT_CONFIGURED',
  /** Configured but physically impossible on this host/device. */
  'NOT_AVAILABLE',
  /** Host or device has not granted the required permission. */
  'PERMISSION_REQUIRED',
  /** Only simulated output was produced. Must never be presented as real. */
  'SIMULATION_ONLY',
  /** A safety gate (kill switch, finance guard, policy) refused the action. */
  'BLOCKED',
  /** Handed to the remote system; confirmation not received yet. */
  'DISPATCHED',
  /**
   * The remote system accepted the request but did not confirm the result
   * (e.g. a 2xx with no identifier, or an ambiguous timeout after send). The
   * action may have taken effect. Never treat this as either success or failure.
   */
  'UNVERIFIED',
  /** Independently confirmed to have taken effect. The only success state. */
  'VERIFIED',
  /** Attempted and it did not work. */
  'FAILED',
] as const;

export type ExecutionOutcome = (typeof EXECUTION_OUTCOMES)[number];

export type EvidenceKind =
  | 'local_file'
  | 'os_command'
  | 'remote_http_response'
  | 'device_ack'
  | 'simulation'
  | 'none';

export interface ExecutionEvidence {
  kind: EvidenceKind;
  /** Human-readable proof, e.g. the absolute file path that was checked. */
  detail: string;
  observedAt: string;
  /** Path, URL, command, or device event id backing the evidence. */
  ref?: string;
  /** Byte size for local_file evidence. */
  sizeBytes?: number;
}

export interface ExecutionReceipt {
  action: string;
  target: string;
  outcome: ExecutionOutcome;
  /** True only for VERIFIED. Kept explicit so callers cannot "assume" success. */
  verified: boolean;
  evidence: ExecutionEvidence | null;
  detailEn: string;
  detailHi: string;
  /** Set when the action was handed off and we are awaiting confirmation. */
  dispatchedAt?: string;
  /** Correlation id the remote system should echo back to upgrade to VERIFIED. */
  dispatchId?: string;
  /** Populated when outcome is FAILED or BLOCKED. */
  failureReason?: string;
}

/** The ONLY outcome that may be reported to a human as "done". */
export function isVerified(receipt: Pick<ExecutionReceipt, 'outcome'>): boolean {
  return receipt.outcome === 'VERIFIED';
}

export function isSimulation(receipt: Pick<ExecutionReceipt, 'outcome'>): boolean {
  return receipt.outcome === 'SIMULATION_ONLY';
}

/**
 * Every outcome other than VERIFIED must be prefixed with an honest qualifier
 * when it reaches a human. This guards Telegram/voice/UI text centrally.
 */
export function outcomeLabel(outcome: ExecutionOutcome): string {
  switch (outcome) {
    case 'VERIFIED':
      return 'VERIFIED';
    case 'DISPATCHED':
      return 'DISPATCHED (awaiting device confirmation)';
    case 'UNVERIFIED':
      return 'UNVERIFIED (accepted but not confirmed)';
    case 'SIMULATION_ONLY':
      return 'SIMULATION_ONLY';
    case 'PERMISSION_REQUIRED':
      return 'PERMISSION_REQUIRED';
    case 'NOT_AVAILABLE':
      return 'NOT_AVAILABLE';
    case 'NOT_CONFIGURED':
      return 'NOT_CONFIGURED';
    case 'BLOCKED':
      return 'BLOCKED';
    case 'FAILED':
      return 'FAILED';
  }
}

export function outcomeLabelHi(outcome: ExecutionOutcome): string {
  switch (outcome) {
    case 'VERIFIED':
      return 'पुष्टि हो गई';
    case 'DISPATCHED':
      return 'भेज दिया (डिवाइस की पुष्टि बाकी है)';
    case 'UNVERIFIED':
      return 'असत्यापित (स्वीकार हुआ, पुष्टि नहीं)';
    case 'SIMULATION_ONLY':
      return 'केवल सिमुलेशन';
    case 'PERMISSION_REQUIRED':
      return 'अनुमति आवश्यक';
    case 'NOT_AVAILABLE':
      return 'उपलब्ध नहीं';
    case 'NOT_CONFIGURED':
      return 'सेटअप नहीं हुआ';
    case 'BLOCKED':
      return 'अवरुद्ध';
    case 'FAILED':
      return 'विफल';
  }
}

export function makeEvidence(
  kind: EvidenceKind,
  detail: string,
  extra: { ref?: string; sizeBytes?: number } = {}
): ExecutionEvidence {
  return { kind, detail, observedAt: new Date().toISOString(), ...extra };
}

export interface ReceiptInit {
  action: string;
  target: string;
  outcome: ExecutionOutcome;
  detailEn: string;
  detailHi: string;
  evidence?: ExecutionEvidence | null;
  dispatchedAt?: string;
  dispatchId?: string;
  failureReason?: string;
}

/**
 * Builds a receipt and derives `verified` from the outcome — callers can never
 * hand-set success. Asking for VERIFIED without evidence is downgraded to
 * DISPATCHED so an unsupported claim cannot be constructed by accident.
 */
export function buildReceipt(init: ReceiptInit): ExecutionReceipt {
  let outcome = init.outcome;
  let evidence = init.evidence ?? null;
  let detailEn = init.detailEn;

  if (outcome === 'VERIFIED' && !evidence) {
    outcome = 'DISPATCHED';
    detailEn = `${detailEn} (downgraded: no verification evidence was supplied)`;
  }

  return {
    action: init.action,
    target: init.target,
    outcome,
    verified: outcome === 'VERIFIED',
    evidence,
    detailEn,
    detailHi: init.detailHi,
    dispatchedAt: init.dispatchedAt,
    dispatchId: init.dispatchId,
    failureReason: init.failureReason,
  };
}

/** Prefixes simulated text so it can never be mistaken for a real result. */
export function tagSimulation(text: string): string {
  return text.includes('SIMULATION_ONLY') ? text : `SIMULATION_ONLY: ${text}`;
}
