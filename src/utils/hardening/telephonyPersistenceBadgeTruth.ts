// ==============================================================================
// HERMES JARVIS — TELEPHONY HUB PERSISTENCE BADGE TRUTH (backlog item 13)
//
// The Telephony & Call Hub persists call history and settings into
// `localStorage` through the shared telephony engine, but the UI never showed
// whether those writes landed. `saveLocalCallHistory` / `saveLocalTelephonySettings`
// returned `void` and swallowed the storage error, so a refused write (quota
// exceeded, private mode, no `localStorage`) looked identical to a durable one:
// the operator read a populated Call Logs tab and a saved-settings form that the
// next reload would silently drop.
//
// This module turns the observed verdict of the last telephony write into the
// badge text, mirroring `memoryPersistenceBadgeTruth.ts`. Only an observed
// `true` may read as stored; an observed refusal names the revert; and no
// observation yet is stated as unknown rather than upgraded to a claim.
// ==============================================================================

/** The observed verdict of the last telephony-store write, or null before one. */
export type TelephonyPersistenceState = boolean | null | undefined;

export type TelephonyPersistenceTone = 'ok' | 'warn' | 'unknown';

/** Compact badge text. Never asserts a local save that was not observed. */
export function telephonyPersistenceBadge(state: TelephonyPersistenceState): string {
  if (state === true) return 'CALL STORE SYNCED';
  if (state === false) return 'NOT SAVED — storage refused';
  return 'PERSISTENCE UNKNOWN';
}

/** Long-form tooltip explaining what the badge's state rests on. */
export function telephonyPersistenceBadgeTitle(state: TelephonyPersistenceState): string {
  if (state === true) {
    return 'The last call-history or telephony-settings write was accepted by localStorage; the stored copy matches this session.';
  }
  if (state === false) {
    return 'The last call-history or telephony-settings write was refused by the browser (quota exceeded, private mode, or no localStorage); these changes revert on reload.';
  }
  return 'No telephony-store write has been observed since load, so the persistence state is not asserted.';
}

/** Colour tone for the badge, derived from the same observed verdict. */
export function telephonyPersistenceTone(state: TelephonyPersistenceState): TelephonyPersistenceTone {
  if (state === true) return 'ok';
  if (state === false) return 'warn';
  return 'unknown';
}
