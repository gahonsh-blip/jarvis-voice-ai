// HERMES JARVIS — Permission Gateway decision honesty (backlog item 13).
//
// `POST /api/approvals/resolve` answers with two independent facts:
//   * `success`   — did the decision/action itself succeed?
//   * `persisted` — did the terminal decision reach durable storage?
//
// The gateway UI used to collapse both into `if (data.success)`, so a body of
// `{ success: true, persisted: false }` (the external action ran but the
// terminal decision could not be written) rendered the plain
// "Authorized & Executed" success banner. Worse, the route's honest failure for
// an unpersisted terminal decision is HTTP 500
// `{ success: false, persisted: false, outcome: 'UNPERSISTED' }`, which fell
// through to the generic "Execution halted" branch — the operator was never told
// the decision had been rolled back and would not survive a restart.
//
// These helpers turn the raw response body into a tone + message that names the
// durability outcome, so no caller reads a decision as recorded when it is not.

export type GatewayDecisionTone = 'success' | 'error' | 'info';

export interface GatewayDecisionOutcome {
  tone: GatewayDecisionTone;
  /** User-facing notification text. */
  message: string;
  /** Spoken line for the assistant voice; matches the notification's claim. */
  speak: string;
}

interface ResolveBody {
  success?: boolean;
  persisted?: boolean;
  outcome?: string;
  message?: string;
  error?: string;
}

function asBody(raw: unknown): ResolveBody {
  return raw && typeof raw === 'object' ? (raw as ResolveBody) : {};
}

/**
 * Verdict for an APPROVE decision. A success is only reported as such when the
 * server also confirms the terminal decision is durable.
 */
export function classifyApproveOutcome(raw: unknown, actionLabel: string): GatewayDecisionOutcome {
  const body = asBody(raw);

  if (body.success === true && body.persisted === true) {
    return {
      tone: 'success',
      message: `✅ Authorized & Executed: "${actionLabel}"`,
      speak: `Level 4 permission granted. Action ${actionLabel} executed successfully, Sir.`,
    };
  }

  if (body.success === true && body.persisted === false) {
    // The action ran, but the decision is not on disk: a restart would re-offer
    // it. Report the execution without claiming the record is durable.
    return {
      tone: 'info',
      message: `⚠️ "${actionLabel}" executed, but the decision was not written to durable storage — it will not survive a restart.`,
      speak: `Action ${actionLabel} executed, but the decision could not be saved and will not survive a restart, Sir.`,
    };
  }

  if (body.outcome === 'UNVERIFIED') {
    return {
      tone: 'error',
      message: `⚠️ Not confirmed: ${body.message || 'no provider confirmation received.'}`,
      speak: 'Approval recorded, but the action could not be confirmed as executed, Sir.',
    };
  }

  if (body.outcome === 'UNPERSISTED') {
    // The route rolled the terminal decision back to PENDING_APPROVAL.
    return {
      tone: 'error',
      message: `⚠️ Not recorded: the decision could not be written to durable storage and was rolled back. ${actionLabel} is still pending.`,
      speak: `The decision for ${actionLabel} could not be saved and was rolled back; it is still pending, Sir.`,
    };
  }

  const reason = body.error || body.message || 'Execution halted';
  return {
    tone: 'error',
    message: reason,
    speak: `Execution notice: ${reason}`,
  };
}

/**
 * Verdict for a REJECT decision. A refusal is only reported as safely recorded
 * when the server confirms the rejection is durable.
 */
export function classifyRejectOutcome(raw: unknown, actionLabel: string): GatewayDecisionOutcome {
  const body = asBody(raw);

  if (body.success === true && body.persisted === true) {
    return {
      tone: 'error',
      message: `❌ Rejected: "${actionLabel}" cancelled safely.`,
      speak: `Action ${actionLabel} cancelled safely without external modification, Sir.`,
    };
  }

  if (body.success === true && body.persisted === false) {
    return {
      tone: 'error',
      message: `⚠️ "${actionLabel}" was rejected, but the decision was not written to durable storage — it will not survive a restart.`,
      speak: `Action ${actionLabel} was rejected, but the decision could not be saved and will not survive a restart, Sir.`,
    };
  }

  const reason = body.error || body.message || 'Rejection was not recorded.';
  return {
    tone: 'error',
    message: `⚠️ Rejection not recorded: ${reason}`,
    speak: `The rejection for ${actionLabel} was not recorded, Sir.`,
  };
}
