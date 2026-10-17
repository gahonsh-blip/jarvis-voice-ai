// =============================================================================
// HERMES JARVIS — Server health claim truth
//
// The four proactive routines in `server.ts` each reported
// `systemHealth.serverStatus: 'Nominal'`. That value was a literal: nothing
// measured it. The routines are built by the very process they describe, so a
// routine can never observe that process independently — a wedged or degraded
// server still returns the same report object. The literal therefore asserted a
// healthy server under exactly the conditions where the claim is most likely to
// be false.
//
// Honest states:
//   NOT_MEASURED — no independent health observation exists for this process.
//   Nominal / Warning / Critical — reserved for a status derived from a real
//     observation (an external probe, or a monitor watching this process).
// =============================================================================

export type ServerStatus = 'NOT_MEASURED' | 'Nominal' | 'Warning' | 'Critical';

/** The status to publish when nothing has actually measured the server. */
export const UNMEASURED_SERVER_STATUS: ServerStatus = 'NOT_MEASURED';

/**
 * Whether a status value is backed by a real observation. `NOT_MEASURED` and
 * any missing/unknown value are not.
 */
export function isMeasuredServerStatus(status: unknown): boolean {
  return status === 'Nominal' || status === 'Warning' || status === 'Critical';
}

/**
 * The status a self-built routine may honestly publish. These routines run
 * inside the process they would assess, so no independent observation exists;
 * the value is always `NOT_MEASURED`. Kept as a function so call sites read as
 * a decision rather than an omission, and so a future external probe can be
 * threaded in here without touching the four routine bodies.
 */
export function assessedServerStatus(): ServerStatus {
  return UNMEASURED_SERVER_STATUS;
}

/** Human-readable note explaining why the routines carry no status verdict. */
export function describeServerHealthClaim(status: ServerStatus): string {
  if (!isMeasuredServerStatus(status)) {
    return 'Server health: NOT_MEASURED — this report is produced by the process it would assess, so no independent health observation exists.';
  }
  return `Server health: ${status} (derived from an external observation).`;
}
