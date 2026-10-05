// ==============================================================================
// HERMES JARVIS — THE CALL'S OWN NUMBER, STATED FROM WHAT WAS RECORDED
//
// `App.tsx` stamped every call record with the app's own side of the line from:
//
//     callerNumber: telephonySettings.twilioPhoneNumber || '+1 (555) 728-4827'
//
// `telephonySettings.twilioPhoneNumber` is empty in any environment that has
// not configured a carrier number, and the client default and the server's
// `telephonySettingsState` both seeded the literal `'+1 (555) 728-4827'`. So an
// outbound call was recorded (and later exported) as originating from a phone
// number nobody entered, and an inbound call as arriving on a number that was
// never read from a carrier. The number is presented in the call history and
// the CSV export as fact, which is the fake-success shape item 13 removes.
//
// The app's own number may only be a value that was actually recorded. When it
// was not, the call record leaves it empty and the surfaces say so rather than
// printing an invented number.
// ==============================================================================

/** The configured app/carrier number, or `null` when none was recorded. */
export function recordedOwnNumber(configured?: string | null): string | null {
  if (typeof configured !== 'string') return null;
  const trimmed = configured.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Whether the number shown is a real configured number rather than a placeholder. */
export function hasRecordedOwnNumber(configured?: string | null): boolean {
  return recordedOwnNumber(configured) !== null;
}

export const OWN_NUMBER_NOT_RECORDED = 'not recorded';
