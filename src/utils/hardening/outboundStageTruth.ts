// ==============================================================================
// HERMES JARVIS — OUTBOUND CALL STAGE TRUTH
// Backlog item 13: "Zero-fake-success for all tools".
//
// `POST /api/telephony/outbound/stage` always answered `{ success: true,
// request, actionId, promptText }`. It discarded the result of
// `createPendingActionRequest`, so when the finance exclusion guard rejected the
// action (`blockedByFinance`) or the emergency stop was active
// (`blockedByEmergency`) the route still reported a staged Level-4 outbound
// call and handed the caller an `actionId` for a request that could never be
// authorized. Worse, it staged a pending outbound request in the session
// manager *before* the safety check, so a blocked dial sat in the pending
// queue as if it were awaiting approval. Success must be claimed only when the
// action genuinely reached `PENDING_APPROVAL`; every block is a no-op.
// ==============================================================================

export type OutboundStageOutcome =
  | 'STAGED'
  | 'BLOCKED_FINANCE'
  | 'BLOCKED_EMERGENCY'
  | 'NOT_STAGED';

export interface OutboundStageVerdict {
  success: boolean;
  staged: boolean;
  outcome: OutboundStageOutcome;
  message: string;
}

export interface OutboundStageInput {
  blockedByFinance?: boolean;
  blockedByEmergency?: boolean;
  financeReason?: string;
  request?: { status?: string } | null;
}

/**
 * Derives the honest reply for an outbound-call staging request. Success is
 * claimed only when the created permission request actually reached
 * `PENDING_APPROVAL`; a finance or emergency block, or any other terminal
 * status, is a no-op and must not hand back an actionable id.
 */
export function classifyOutboundStage(result: OutboundStageInput): OutboundStageVerdict {
  if (result.blockedByFinance) {
    return {
      success: false,
      staged: false,
      outcome: 'BLOCKED_FINANCE',
      message: result.financeReason || 'Blocked by the finance exclusion guard.',
    };
  }

  if (result.blockedByEmergency) {
    return {
      success: false,
      staged: false,
      outcome: 'BLOCKED_EMERGENCY',
      message: 'Emergency Stop is active; the outbound call was not staged for approval.',
    };
  }

  const status = result.request?.status;
  if (status === 'PENDING_APPROVAL') {
    return {
      success: true,
      staged: true,
      outcome: 'STAGED',
      message: 'Outbound call staged for human approval.',
    };
  }

  return {
    success: false,
    staged: false,
    outcome: 'NOT_STAGED',
    message: `Outbound call was not staged for approval (request status ${status ?? 'unknown'}).`,
  };
}
