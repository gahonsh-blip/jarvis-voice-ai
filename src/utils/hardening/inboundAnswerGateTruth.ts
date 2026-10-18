// ==============================================================================
// HERMES JARVIS — inbound call answering permission gate (backlog item 13).
//
// `PHONE_INBOUND_ANSWER` ("Autonomous Inbound Call Answering") is advertised on
// the telephony permission screen, stored in the permission matrix and served
// by `GET /api/telephony/permissions`. `POST /api/telephony/incoming` — the
// webhook a carrier calls when the clinic line rings — never read it. It
// checked the webhook signature, checked the emergency stop, and then created a
// session and answered unconditionally. An operator who set the permission to
// `DENIED` still had JARVIS pick up the phone and greet the caller, while the
// permission screen showed the surface as revoked.
//
// This module makes the route consult the matrix. Only an explicit `GRANTED`
// authorizes an unattended answer: `DENIED` is a refusal, and `ASK` /
// `NOT_CONFIGURED` / a missing value are *undecided*, which is not consent — a
// phone call cannot be paused to ask the operator, and reading "not yet
// decided" as "go ahead" is the same defect the owner-approval path already had.
// ==============================================================================

import type {
  PhonePermissionKey,
  PhonePermissionState,
} from '../../types/telephonyProvider';

export type InboundAnswerOutcome =
  | 'ALLOWED'
  | 'PERMISSION_DENIED'
  | 'PERMISSION_UNDECIDED';

export interface InboundAnswerVerdict {
  /** True only for an explicit GRANTED permission. */
  allowed: boolean;
  outcome: InboundAnswerOutcome;
  /** The state the matrix actually held, or 'UNKNOWN' when it held nothing. */
  permission: PhonePermissionState | 'UNKNOWN';
  reason: string;
}

const KEY: PhonePermissionKey = 'PHONE_INBOUND_ANSWER';

/**
 * Decide whether the inbound webhook may answer. `permissions` is the
 * authoritative matrix view (the durable store when one is configured, the
 * defaults otherwise) — never a value the caller of this helper invented.
 */
export function inboundAnswerGate(
  permissions: Partial<Record<PhonePermissionKey, PhonePermissionState>> | null | undefined,
): InboundAnswerVerdict {
  const state = permissions?.[KEY];
  if (state === 'GRANTED') {
    return {
      allowed: true,
      outcome: 'ALLOWED',
      permission: 'GRANTED',
      reason: 'Autonomous inbound answering is granted by the permission matrix.',
    };
  }
  if (state === 'DENIED') {
    return {
      allowed: false,
      outcome: 'PERMISSION_DENIED',
      permission: 'DENIED',
      reason: 'Autonomous inbound answering is denied by the permission matrix; the call was not answered.',
    };
  }
  return {
    allowed: false,
    outcome: 'PERMISSION_UNDECIDED',
    permission: state ?? 'UNKNOWN',
    reason: `Autonomous inbound answering is ${state ?? 'unset'} — not an approval, so the call was not answered.`,
  };
}

/** TwiML refusal sent to a carrier that expects an XML response. */
export function inboundAnswerRejectionTwiML(verdict: InboundAnswerVerdict): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Aditi" language="hi-IN">क्षमा करें, इस लाइन पर स्वचालित कॉल उत्तर वर्तमान में अक्षम है। कृपया बाद में प्रयास करें।</Say>
  <Say voice="Polly.Matthew" language="en-IN">Sorry, automated answering on this line is currently disabled. Please try again later.</Say>
  <Hangup/>
</Response>`;
}

/** JSON refusal for a caller that does not speak TwiML. */
export function inboundAnswerRejectionBody(verdict: InboundAnswerVerdict) {
  return {
    success: false,
    answered: false,
    outcome: verdict.outcome,
    permission: verdict.permission,
    error: 'INBOUND_ANSWER_NOT_PERMITTED',
    message: verdict.reason,
  };
}
