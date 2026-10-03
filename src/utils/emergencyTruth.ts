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

// ==============================================================================
// RESUME TRANSITION — did the resume actually release anything?
//
// `POST /api/system/resume` used to answer `success: true` and log an
// "EMERGENCY STOP DEACTIVATED … RESUMED" audit row unconditionally, so a resume
// while nothing was frozen still read as released autonomy. The verdict is
// derived from the state observed *before* the transition, so the reply and the
// audit can only claim a release the pre-state supports.
// ==============================================================================

export type EmergencyResumeOutcome = 'RESUMED' | 'ALREADY_ACTIVE' | 'LATCHED' | 'UNKNOWN';

/**
 * The pre-transition state a toggle request should act on. `flip` reproduces
 * the flag-flipping `toggleEmergencyStop` only when the requested transition is
 * one the pre-state supports; otherwise the request is a no-op and the verdict
 * derived from `pre` will report that nothing changed.
 *
 * - stop: engages only when the pause is not already set and the hard kill
 *   switch is not latched (a latched switch already holds the freeze).
 * - resume: releases only when the pause is set and the switch is not latched.
 */
export function emergencyTogglePreAction(
  action: 'stop' | 'resume',
  pre: EmergencyStatusShape | null | undefined
): { pre: EmergencyStatusShape | null | undefined; flip: boolean } {
  if (pre == null || typeof pre.emergencyPaused !== 'boolean') {
    return { pre, flip: false };
  }
  if (pre.hardKillSwitchTriggered === true) {
    return { pre, flip: false };
  }
  if (action === 'stop') {
    return { pre, flip: !pre.emergencyPaused };
  }
  return { pre, flip: pre.emergencyPaused };
}

export interface EmergencyResumeVerdict {
  /** True only when a freeze was actually in force and is being released. */
  actionExecuted: boolean;
  outcome: EmergencyResumeOutcome;
  title: string;
  message: string;
}

/**
 * Decide whether a resume releases anything, from the pre-transition state.
 *
 * An unobserved state is not a release: `actionExecuted` is false and the
 * outcome is UNKNOWN, so the caller must not log or speak a resume it cannot
 * substantiate. A latched hard kill switch is also not a release —
 * `resumeSystemOperation` clears the pause flag but not the latch, so the freeze
 * remains and claiming otherwise would be a false success in the unsafe
 * direction.
 */
export function emergencyResumeVerdict(pre: EmergencyStatusShape | null | undefined): EmergencyResumeVerdict {
  if (!emergencyStatusKnown(pre)) {
    return {
      actionExecuted: false,
      outcome: 'UNKNOWN',
      title: 'Resume state unknown',
      message:
        'The emergency state could not be observed, so no release was claimed. Refresh the status and retry.',
    };
  }

  if (pre?.hardKillSwitchTriggered === true) {
    return {
      actionExecuted: false,
      outcome: 'LATCHED',
      title: 'Emergency Stop NOT Released (hard kill switch latched)',
      message:
        'The hard kill switch is latched, so the emergency freeze is still in force and the resume did not release it. It must be cleared by an operator.',
    };
  }

  if (pre?.emergencyPaused === true) {
    return {
      actionExecuted: true,
      outcome: 'RESUMED',
      title: 'Emergency Stop Released',
      message: 'System operations resumed successfully.',
    };
  }

  return {
    actionExecuted: false,
    outcome: 'ALREADY_ACTIVE',
    title: 'System Already Running (nothing to release)',
    message: 'No emergency stop was active, so nothing was released. Subsystems were already running normally.',
  };
}

// ==============================================================================
// GLOBAL KILL SWITCH — did engaging it actually terminate anything?
//
// `POST /api/system/kill-switch` (`server.ts`) always answered `success: true`
// with "All background processes terminated and queue cleared" and always wrote
// a `🚨 GLOBAL KILL SWITCH TRIGGERED … cleared N pending …` audit row, whatever
// the pre-transition state. Engaging it while the system was already frozen
// clears nothing (there are no PENDING_APPROVAL requests left to reject) yet
// still reported a fresh termination of the queue; and when the state could not
// be observed at all the route still claimed it had engaged. The verdict below
// is derived from the state observed *before* the transition and the real
// cleared count, so a re-engagement is reported as a no-op and an unobserved
// state is never claimed as engaged.
// ==============================================================================

export type KillSwitchOutcome = 'ENGAGED' | 'ALREADY_ENGAGED' | 'UNKNOWN';

export interface KillSwitchVerdict {
  /** True only when the freeze is known to have been engaged by this request. */
  actionExecuted: boolean;
  outcome: KillSwitchOutcome;
  clearedTasksCount: number;
  headline: string;
  message: string;
}

/**
 * Decide whether engaging the kill switch did anything, from the pre-transition
 * state and the number of queued requests the activation actually cleared.
 *
 * The hard kill switch is idempotent: engaging it again while it is already
 * latched clears no further queue and must not be logged or spoken as a fresh
 * termination. An unobserved state is neither engaged nor already-engaged.
 */
export function killSwitchVerdict(
  pre: EmergencyStatusShape | null | undefined,
  clearedTasksCount: number
): KillSwitchVerdict {
  const cleared = Number.isFinite(clearedTasksCount) && clearedTasksCount > 0 ? clearedTasksCount : 0;

  if (!emergencyStatusKnown(pre)) {
    return {
      actionExecuted: false,
      outcome: 'UNKNOWN',
      clearedTasksCount: cleared,
      headline: 'KILL SWITCH STATE UNKNOWN',
      message:
        'The emergency state could not be observed, so the kill switch engagement was not confirmed. Refresh the status and retry.',
    };
  }

  if (pre?.emergencyPaused === true || pre?.hardKillSwitchTriggered === true) {
    return {
      actionExecuted: false,
      outcome: 'ALREADY_ENGAGED',
      clearedTasksCount: cleared,
      headline: 'KILL SWITCH ALREADY ENGAGED',
      message:
        'The emergency freeze was already in force, so no background processes were terminated and no queue was newly cleared. The kill switch stays engaged.',
    };
  }

  return {
    actionExecuted: true,
    outcome: 'ENGAGED',
    clearedTasksCount: cleared,
    headline: 'KILL SWITCH ENGAGED',
    message:
      cleared > 0
        ? `Global Kill Switch engaged. All background processes terminated and ${cleared} queued task(s) cleared.`
        : 'Global Kill Switch engaged. All background processes terminated; no queued tasks were waiting to clear.',
  };
}

