// ==============================================================================
// HERMES JARVIS — OUTBOUND CALL AUTHORIZATION TRUTH
//
// `POST /api/telephony/outbound/authorize` (`server.ts`) answered
// `success: true, authorized: false, message: 'Outbound call cancelled.'`
// whenever the decision was not `APPROVE` — including for a `requestId` that
// was never staged. Nothing was cancelled because nothing existed: the reply
// told the operator an outbound call had been withdrawn when the request was
// not on record. That is the fake-success shape item 13 removes.
//
// The APPROVE branch has the same defect in the dangerous direction: an unknown
// `requestId` is still marked `authorized: true`, so a caller reading the
// authorization flag would treat a never-staged call as approved.
//
// This module decides the honest verdict from what the authorization actually
// did — it records a decision only when a staged request was found.
// ==============================================================================

export interface OutboundAuthorizationRecord {
  success: boolean;
  request?: unknown;
  error?: string;
}

export type OutboundAuthorizationOutcome =
  | 'APPROVED'
  | 'REJECTED'
  | 'NOT_FOUND';

export interface OutboundAuthorizationVerdict {
  /** True only when a real request record was found and its decision recorded. */
  success: boolean;
  /** True only when the request was found and the decision was APPROVE. */
  authorized: boolean;
  outcome: OutboundAuthorizationOutcome;
  message: string;
}

/**
 * Classify the result of recording an outbound-call authorization decision.
 *
 * `recorded` is whatever `TelephonySessionManager.authorizeOutboundRequest`
 * returned. When no request matched the id, `success` is false and the verdict
 * says the request was not found — an absent request is neither cancelled nor
 * authorized, regardless of the requested decision.
 */
export function classifyOutboundAuthorization(
  decision: 'APPROVE' | 'REJECT',
  recorded: OutboundAuthorizationRecord | null | undefined
): OutboundAuthorizationVerdict {
  if (!recorded || recorded.success !== true || !recorded.request) {
    return {
      success: false,
      authorized: false,
      outcome: 'NOT_FOUND',
      message:
        'No pending outbound-call request matched that id, so no authorization decision was recorded.',
    };
  }

  if (decision === 'APPROVE') {
    return {
      success: true,
      authorized: true,
      outcome: 'APPROVED',
      message: 'Outbound call authorized.',
    };
  }

  return {
    success: true,
    authorized: false,
    outcome: 'REJECTED',
    message: 'Outbound call cancelled.',
  };
}
