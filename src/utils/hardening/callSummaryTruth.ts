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
