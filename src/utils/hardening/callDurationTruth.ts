// ==============================================================================
// HERMES JARVIS — CALL DURATION, STATED FROM WHAT WAS MEASURED
//
// `App.tsx` finalised every call with:
//
//     durationSeconds: Math.max(activeCall.durationSeconds || 14, 14)
//
// `activeCall.durationSeconds` is written as `0` when a call is created and is
// never advanced, because the only live counter lives in `ActiveCallHUD`'s local
// `useState` and is never written back to the record. So the expression above
// resolved to a constant: every persisted call — answered, declined, or hung up
// in the first second — was recorded and displayed with a duration of at least
// 14 seconds. The call history, the CSV export, and the post-call summary then
// presented that invented number as the length of a conversation that may not
// have happened.
//
// A duration may only be a value that was actually observed: a stored count, or
// the gap between the call's real start and end timestamps. When neither exists
// the duration is reported as not recorded, never guessed.
// ==============================================================================

/** A call duration that was measured, or `null` when nothing was measured. */
export type MeasuredDuration = number | null;

interface CallTiming {
  startTime?: string | null;
  endTime?: string | null;
  durationSeconds?: number | null;
}

/**
 * Whole seconds between two ISO timestamps, or `null` if either is missing,
 * unparseable, or the end precedes the start. A zero-length gap is a real `0`.
 */
export function elapsedSecondsSince(startTime?: string | null, endTime?: string | null): MeasuredDuration {
  const start = Date.parse(startTime ?? '');
  const end = Date.parse(endTime ?? '');
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  return Math.round((end - start) / 1000);
}

/**
 * The duration to attribute to a call: a stored measured count when present,
 * otherwise the start/end timestamp gap, otherwise `null`. Never a floor, never
 * a default — an unmeasured call reports `null`.
 */
export function recordedCallDurationSeconds(call: CallTiming): MeasuredDuration {
  if (typeof call.durationSeconds === 'number' && Number.isFinite(call.durationSeconds)) {
    return call.durationSeconds;
  }
  return elapsedSecondsSince(call.startTime, call.endTime);
}

export const DURATION_NOT_RECORDED = 'duration not recorded';

/** `MM:SS`, or `--:--` when the duration was never measured. */
export function formatDurationClock(seconds: MeasuredDuration): string {
  if (seconds == null || !Number.isFinite(seconds)) {
    return '--:--';
  }
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/** `2m 25s`, or an explicit "not recorded" when the duration was never measured. */
export function formatDurationWords(seconds: MeasuredDuration): string {
  if (seconds == null || !Number.isFinite(seconds)) {
    return DURATION_NOT_RECORDED;
  }
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}m ${safe % 60}s`;
}
