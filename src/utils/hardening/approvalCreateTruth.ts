// ==============================================================================
// HERMES JARVIS — APPROVAL CREATE TRUTH
// Backlog item 13: "Zero-fake-success for all tools".
//
// `POST /api/approvals/create` answered `{ success: true, request }` for every
// request that matched a stored record. When the action was blocked by the
// finance guard or the emergency stop the request object was still returned,
// but the route decided `success` from the *shape of the response* rather than
// from whether the request was actually staged for approval. The route must
// answer `success` only when a request genuinely reached `PENDING_APPROVAL`;
// a blocked or non-pending request is reported as a no-op, never as success.
// ==============================================================================

export type ApprovalCreateOutcome =
  | 'PENDING_APPROVAL'
  | 'BLOCKED_FINANCE'
  | 'BLOCKED_EMERGENCY'
  | 'NOT_STAGED';

export interface ApprovalCreateVerdict {
  success: boolean;
  staged: boolean;
  outcome: ApprovalCreateOutcome;
  message: string;
}

export interface ApprovalCreateInput {
  blockedByFinance?: boolean;
  blockedByEmergency?: boolean;
  financeReason?: string;
  request?: { status?: string } | null;
}

/**
 * Derives the honest reply for an approval-create request. Success is claimed
 * only when the created request actually reached `PENDING_APPROVAL`; a finance
 * or emergency block, or any other terminal status, is a no-op.
 */
export function classifyApprovalCreate(result: ApprovalCreateInput): ApprovalCreateVerdict {
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
      message: 'Emergency Stop is active; the action was not staged for approval.',
    };
  }

  const status = result.request?.status;
  if (status === 'PENDING_APPROVAL') {
    return {
      success: true,
      staged: true,
      outcome: 'PENDING_APPROVAL',
      message: 'Action staged for human approval.',
    };
  }

  return {
    success: false,
    staged: false,
    outcome: 'NOT_STAGED',
    message: `Action was not staged for approval (request status ${status ?? 'unknown'}).`,
  };
}
