// ==============================================================================
// HERMES JARVIS — CALL SUMMARY AND ACTION ITEMS, STATED FROM WHAT HAPPENED
//
// `summarizeCallTranscript()` in src/utils/telephonyEngine.ts finalises a call
// and its output is rendered under the headings "Assigned Action Items & Next
// Steps" (TelephonyHubModal) and "Action Items & Next Steps" (ActiveCallHUD).
// Two things were wrong there:
//
//   1. The follow-up strings were phrased as completed work — "Calendar event
//      dispatched", "Added caller to spam blocklist" — while the function only
//      regex-matched the transcript text. Nothing dispatched a calendar event,
//      blacklisted a number, or sent an SMS; there is no such side-effect in
//      this path. The list also rendered with a green check on every row, so a
//      string match was presented to the operator as a finished task.
//   2. The summary claimed "Successfully conveyed objectives ... synced action
//      items" for an outbound call and "confirmed schedule/delivery notes" for an
//      inbound one, none of which the summariser observed. It read transcript
//      words.
//
// A summary may describe what was discussed and what the operator still needs to
// do. It must not report as done anything nobody did.
// ==============================================================================

/** Marker every recorded-but-unperformed action item carries. */
export const ACTION_ITEM_NOT_PERFORMED_NOTE = 'not performed — recorded for human follow-up';

/**
 * Renders a recorded follow-up as an outstanding task rather than a completed
 * one. Idempotent: an item that already carries the note is returned unchanged,
 * so a surface can format a value more than once without doubling the marker.
 */
export function formatActionItem(item: string): string {
  const trimmed = (item ?? '').trim();
  if (!trimmed) {
    return `No action item recorded — ${ACTION_ITEM_NOT_PERFORMED_NOTE}`;
  }
  if (trimmed.includes(ACTION_ITEM_NOT_PERFORMED_NOTE)) {
    return trimmed;
  }
  return `${trimmed} — ${ACTION_ITEM_NOT_PERFORMED_NOTE}`;
}

/** Note rendered beside the action-item list so the heading is not read as a ledger. */
export const ACTION_ITEM_LIST_NOTE = 'Recorded for human follow-up — not yet performed by JARVIS.';

/**
 * Marker for a follow-up captured live during a call turn. `POST
 * /api/telephony/handle-turn` (server.ts) returns the model's/fallback's
 * `followUpActions`, and the UI surfaces those strings directly. Nothing in
 * that request path dispatches a calendar write, sends an SMS, blacklists a
 * number or opens a package follow-up; the route only produces the reply text.
 * So a live-captured item carries this marker rather than reading as a receipt.
 */
export const LIVE_ACTION_ITEM_NOTE = 'recorded live — not confirmed as performed';

/** Idempotent formatter for a live-captured follow-up: a task, never a receipt. */
export function formatLiveActionItem(item: string): string {
  const trimmed = (item ?? '').trim();
  if (!trimmed) {
    return `No action item recorded — ${LIVE_ACTION_ITEM_NOTE}`;
  }
  if (trimmed.includes(LIVE_ACTION_ITEM_NOTE)) {
    return trimmed;
  }
  return `${trimmed} — ${LIVE_ACTION_ITEM_NOTE}`;
}

/**
 * Marker for the live "AI Whisper Tip" surface. `POST
 * /api/telephony/handle-turn` returns a `whisperTip` the model invents
 * (`App.tsx` pushes it as a `whisper` transcript turn and `ActiveCallHUD.tsx`
 * renders it under the label `AI Whisper Tip`). The model is asked for
 * intelligence about the call, and it answers with unsupported assertions of
 * system events — e.g. `Appointment slot confirmed for Thursday 2:30 PM`,
 * `Robocall / telemarketer identified and terminated`. Nothing in that request
 * path dispatched an appointment confirmation or terminated the line.
 *
 * A whisper tip is advice to the operator; it may not read as a receipt for an
 * action the system performed. A model-authored tip is marked as a suggestion
 * so a reader cannot mistake it for an observed event.
 */
export const WHISPER_TIP_NOT_AN_EVENT_NOTE = 'AI suggestion — not an observed system event';

/**
 * Renders a model-authored whisper tip as a suggestion. Applied to the
 * untrusted LLM branch (the model can answer with a receipt no matter how the
 * prompt is worded); the rule-based fallbacks author their strings as
 * suggestions directly. Idempotent, and an empty tip stays empty so the UI
 * reports the absence rather than a filled-in default.
 */
export function whisperTipForDisplay(tip: unknown): string {
  const trimmed = typeof tip === 'string' ? tip.trim() : '';
  if (!trimmed) return '';
  if (trimmed.includes(WHISPER_TIP_NOT_AN_EVENT_NOTE)) return trimmed;
  return `${trimmed} — ${WHISPER_TIP_NOT_AN_EVENT_NOTE}`;
}

/**
 * Honest summary for a completed outbound call. It states only what the
 * summariser can see: that a call took place, what was discussed, and that
 * follow-ups remain outstanding.
 */
export function describeOutboundCall(counterpart: string): string {
  return `JARVIS placed an outbound call to ${counterpart}. Objectives and scheduling notes were discussed and logged. Follow-up items below are recorded for human review and have not been performed by JARVIS.`;
}

/** Honest summary for a completed inbound call. */
export function describeInboundCall(counterpart: string): string {
  return `JARVIS AI Receptionist answered an incoming call from ${counterpart}. The inquiry and any schedule/delivery notes were logged. Follow-up items below are recorded for human review and have not been performed by JARVIS.`;
}

/**
 * Note rendered when a completed call carries no summary text. `App.tsx` stores
 * an empty summary for the "declined by user or spam filter" path; the post-call
 * HUD used to substitute "Call concluded normally." for that empty value — an
 * assurance about how the call went that nothing observed.
 */
export const NO_CALL_SUMMARY_NOTE =
  'No call summary was recorded for this call — the outcome was not observed, so no conclusion is asserted.';

/**
 * Honest rendering of a completed call's summary field. A real summary (from
 * `summarizeCallTranscript()`) passes through; an empty or whitespace-only value
 * is reported as an absent summary rather than as a normal conclusion.
 */
export function describeCallSummary(summary: string | null | undefined): string {
  const trimmed = (summary ?? '').trim();
  if (!trimmed) return NO_CALL_SUMMARY_NOTE;
  return trimmed;
}

/**
 * Marker for the offline (no-server) conversational turn. `processTelephonyTurn`
 * falls back to `generateLocalCallTurn` whenever `POST /api/telephony/handle-turn`
 * is unreachable — the exact offline-first case this app exists for. The
 * rule-based replies there were written as receipts for work nothing performed:
 * "I have locked this into Alex's calendar and synced our reminders", "I have
 * added the session to the calendar and notified the team", "adding your caller
 * ID to our blocked directory". `generateLocalCallTurn` regex-matches the
 * caller's words; it writes no calendar, sends no Telegram message and blocks no
 * number. The reply is a script, not a record of side effects.
 */
export const LOCAL_TURN_REPLY_NOTE = 'Automated assistant reply — actions described are not confirmed as performed.';

/** Appends the offline-turn disclosure to a rule-based reply. Idempotent. */
export function formatLocalTurnReply(replyText: string): string {
  const trimmed = (replyText ?? '').trim();
  if (!trimmed) {
    return LOCAL_TURN_REPLY_NOTE;
  }
  if (trimmed.includes(LOCAL_TURN_REPLY_NOTE)) {
    return trimmed;
  }
  return `${trimmed} ${LOCAL_TURN_REPLY_NOTE}`;
}

/**
 * Heading for the recorded-call transcript panel. `TelephonyHubModal` rendered
 * `Complete Verified Transcript (N turns)` unconditionally. Nothing in the
 * capture path verifies a turn: the agent turns are the scripted greeting and
 * the model-authored reply (spoken through the browser synth, never read back),
 * and the caller/callee turns come from the browser's own speech recognition.
 * No transcription provider, per-turn confidence or speaker disambiguation was
 * ever consulted, so the word "Verified" asserted a check nobody performed.
 *
 * The heading names the turns as recorded. A non-finite or absent count is
 * reported explicitly rather than coerced to a measured-looking `0`.
 */
export function callTranscriptHeadingLabel(turns: number | null | undefined): string {
  const count =
    typeof turns === 'number' && Number.isFinite(turns) ? Math.max(0, Math.floor(turns)) : null;
  return count === null
    ? 'Recorded Call Transcript (turn count unmeasured)'
    : `Recorded Call Transcript (${count} turn${count === 1 ? '' : 's'})`;
}

/**
 * Note rendered beside the transcript so a recorded turn is not read as a
 * provider-verified one.
 */
export const TRANSCRIPT_NOT_VERIFIED_NOTE =
  'Recorded turns — not verified by a transcription provider and not speaker-confirmed.';

/** Marker every offline-captured action item carries. */
export const LOCAL_TURN_ACTION_ITEM_NOTE = 'captured offline — not confirmed as performed';

/**
 * Renders an offline-captured follow-up as an outstanding task. These strings
 * were phrased as receipts ("Medical appointment confirmed for Friday 3:00 PM",
 * "Blocked spam marketing number"); nothing performed them. Idempotent.
 */
export function formatLocalTurnFollowUp(item: string): string {
  const trimmed = (item ?? '').trim();
  if (!trimmed) {
    return `No action item recorded — ${LOCAL_TURN_ACTION_ITEM_NOTE}`;
  }
  if (trimmed.includes(LOCAL_TURN_ACTION_ITEM_NOTE)) {
    return trimmed;
  }
  return `${trimmed} — ${LOCAL_TURN_ACTION_ITEM_NOTE}`;
}
