// ==============================================================================
// HERMES JARVIS — KILL-SWITCH LIVENESS, STATED HONESTLY
//
// The Permission Gateway header is the screen a human reads before approving an
// external, irreversible action. It rendered a fixed green "ACTIVE" badge for
// any state that was not paused — including the state where the emergency
// status request had never answered. That made "permission gateway is armed" a
// claim about a value nobody had fetched, and it made the approval control
// clickable while the state it depends on was unknown.
//
// This module is a pure, dependency-free tri-state so a value that was never
// observed can never read as healthy. Callers pass the fetched status object,
// and `null`/`undefined`/missing-boolean resolves to UNKNOWN, never ACTIVE.
// ==============================================================================

export type EmergencyLiveness = 'ACTIVE' | 'ENGAGED' | 'UNKNOWN';

/** The subset of the emergency status this helper reads. */
export interface EmergencyStatusShape {
  emergencyPaused?: boolean;
  hardKillSwitchTriggered?: boolean;
}

/**
 * Tri-state kill-switch liveness. ENGAGED when either the global pause or the
 * hard kill switch is set; UNKNOWN until a real boolean has been observed.
 */
export function emergencyLiveness(status: EmergencyStatusShape | null | undefined): EmergencyLiveness {
  if (status == null || typeof status.emergencyPaused !== 'boolean') return 'UNKNOWN';
  if (status.emergencyPaused || status.hardKillSwitchTriggered === true) return 'ENGAGED';
  return 'ACTIVE';
}

/**
 * True only when a fetched status carried a real boolean. A failed or
 * unattempted fetch is not evidence that the gateway is armed.
 */
export function emergencyStatusKnown(status: EmergencyStatusShape | null | undefined): boolean {
  return status != null && typeof status.emergencyPaused === 'boolean';
}

/**
 * True only when the kill switch is *known* to be engaged. Unknown is not
 * engaged for the purpose of a warning banner, but it is also never ACTIVE —
 * callers must render UNKNOWN separately rather than treating it as safe.
 */
export function emergencyEngaged(status: EmergencyStatusShape | null | undefined): boolean {
  return emergencyLiveness(status) === 'ENGAGED';
}

/** Badge text for the gateway header. Never a bare "ACTIVE" for an unqueried state. */
export function emergencyLivenessLabel(liveness: EmergencyLiveness): 'EMERGENCY STOP' | 'ACTIVE' | 'STATUS UNKNOWN' {
  if (liveness === 'ENGAGED') return 'EMERGENCY STOP';
  if (liveness === 'ACTIVE') return 'ACTIVE';
  return 'STATUS UNKNOWN';
}
