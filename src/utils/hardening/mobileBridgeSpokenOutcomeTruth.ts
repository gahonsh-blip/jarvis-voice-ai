// =============================================================================
// HERMES JARVIS — Mobile bridge spoken-outcome truth (backlog item 13)
//
// The App-level Android approval callbacks discarded the bridge engine's return
// value and spoke a flat "done" line regardless of what the engine reported:
//
//   handleAnswerMobileCall  -> speakText('सर, कॉल उठा ली गई है।')
//   handleReplyMobileMessage -> speakText('सर, संदेश का उत्तर सफलतापूर्वक भेज दिया गया है।')
//
// `AndroidBridgeManager.executeCallAnswer()` / `executeMessageReply()` do not
// always succeed. They return `{ success: false, status: 'PERMISSION_REQUIRED'
// | 'MOBILE_NOT_CONNECTED' | 'BLOCKED_EMERGENCY_STOP' | 'CALL_NOT_FOUND' |
// 'REPLY_UNAVAILABLE' | 'ROLE_REQUIRED' | 'CALL_ANSWER_UNSUPPORTED' }` and, even
// on the happy path, deliberately return `success: false` with status
// `ANSWER_DISPATCHED` / `REPLY_DISPATCHED` because only the handset's own
// ACTION_RESULT may upgrade the action to VERIFIED (`confirmCallAnswer`). The
// spoken line therefore asserted a completed call/reply that was never
// observed — and the handler also cleared the pending-approval card even when
// the engine had left the event pending on a refusal.
//
// This module converts the engine verdict into the exact line to speak and
// whether the pending event was actually consumed, so the voice path can no
// longer claim an action the engine refused or could not confirm.
// =============================================================================

export interface MobileBridgeSpokenOutcome {
  /** True only when the engine reported success (a confirmed dispatch). */
  confirmed: boolean;
  /** True when the engine consumed the pending event (dispatch/success path). */
  consumed: boolean;
  /** The exact line to speak. Never claims an answer/delivery the device did not confirm. */
  spoken: string;
  /** The engine status, surfaced verbatim for diagnostics and tests. */
  status: string;
}

/** Spoken when a call-answer command reached the device but confirmation is pending. */
export const MOBILE_CALL_ANSWER_DISPATCHED_LINE =
  'सर, कॉल उठाने का निर्देश डिवाइस को भेज दिया गया है। डिवाइस की पुष्टि आते ही बताऊँगा।';

/** Spoken when a message reply reached the device but delivery is unconfirmed. */
export const MOBILE_REPLY_DISPATCHED_LINE =
  'सर, संदेश का उत्तर डिवाइस को भेज दिया गया है। डिलीवरी की पुष्टि बाकी है।';

/** Honest fallback when the engine refused and supplied no Hindi reason. */
export const MOBILE_BRIDGE_REFUSED_FALLBACK = 'सर, यह कार्य पूरा नहीं हो सका।';

interface EngineVerdict {
  success?: unknown;
  status?: unknown;
  messageEn?: unknown;
  messageHi?: unknown;
}

function readVerdict(result: unknown): {
  success: boolean;
  status: string;
  messageEn: string;
  messageHi: string;
} {
  const v = (result ?? {}) as EngineVerdict;
  return {
    success: v.success === true,
    status: typeof v.status === 'string' ? v.status : 'UNKNOWN',
    messageEn: typeof v.messageEn === 'string' ? v.messageEn.trim() : '',
    messageHi: typeof v.messageHi === 'string' ? v.messageHi.trim() : '',
  };
}

/** The statuses that mean the engine handed the work to the device (event consumed). */
const DISPATCHED_STATUSES = new Set(['ANSWER_DISPATCHED', 'REPLY_DISPATCHED']);

function buildOutcome(
  result: unknown,
  dispatchedStatus: string,
  dispatchedLine: string,
  successLine: string
): MobileBridgeSpokenOutcome {
  const v = readVerdict(result);

  // A real hand-off that the device has not confirmed. Prefer the engine's own
  // Hindi notice (it distinguishes an inline reply from the open-app fallback);
  // fall back to the generic dispatched line.
  if (v.status === dispatchedStatus) {
    return {
      confirmed: false,
      consumed: true,
      spoken: v.messageHi || dispatchedLine,
      status: v.status,
    };
  }

  if (v.success) {
    return {
      confirmed: true,
      consumed: true,
      spoken: v.messageHi || successLine,
      status: v.status,
    };
  }

  // Refusal/unsupported: speak the engine's own Hindi reason. The event was not
  // consumed, so the caller must leave the pending card visible.
  return {
    confirmed: false,
    consumed: false,
    spoken: v.messageHi || (v.messageEn ? `सर, ${v.messageEn}` : MOBILE_BRIDGE_REFUSED_FALLBACK),
    status: v.status,
  };
}

/**
 * Interpret `executeCallAnswer()`'s verdict for the spoken channel and the
 * pending-card state. A dispatched answer is neither confirmed nor a failure: it
 * is reported as handed to the device, and the card is dismissed only then.
 */
export function mobileCallAnswerOutcome(result: unknown): MobileBridgeSpokenOutcome {
  return buildOutcome(result, 'ANSWER_DISPATCHED', MOBILE_CALL_ANSWER_DISPATCHED_LINE, MOBILE_CALL_ANSWER_DISPATCHED_LINE);
}

/**
 * Interpret `executeMessageReply()`'s verdict. `success` is true only when the
 * engine itself confirmed the reply; the dispatched path (inline reply or the
 * open-app fallback) is spoken as unconfirmed, never as "sent successfully".
 */
export function mobileMessageReplyOutcome(result: unknown): MobileBridgeSpokenOutcome {
  return buildOutcome(result, 'REPLY_DISPATCHED', MOBILE_REPLY_DISPATCHED_LINE, MOBILE_REPLY_DISPATCHED_LINE);
}

/** True when the given status means the engine handed the work to the device. */
export function isDispatchedStatus(status: string): boolean {
  return DISPATCHED_STATUSES.has(status);
}
