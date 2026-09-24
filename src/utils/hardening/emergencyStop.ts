// ==============================================================================
// EMERGENCY STOP — single shared source of truth.
//
// Both the HTTP layer (`server.ts`) and the low-level action executors consult
// this. Safety checks must never depend on a caller remembering to pass a flag:
// if a new dispatch path forgets, an engaged kill switch would silently stop
// working. Reading the live state here makes the executor fail-safe on its own.
// ==============================================================================

import { getEmergencyState } from '../../../server_tools';

/** True while the global emergency stop or the hard kill switch is engaged. */
export function isEmergencyStopActive(): boolean {
  const emergency = getEmergencyState();
  return Boolean(emergency.emergencyPaused || emergency.hardKillSwitchTriggered);
}

/** Machine-readable reason suitable for a receipt's failureReason field. */
export function emergencyStopFailureReason(): string {
  const emergency = getEmergencyState();
  return emergency.hardKillSwitchTriggered ? 'HARD_KILL_SWITCH' : 'EMERGENCY_STOP';
}
