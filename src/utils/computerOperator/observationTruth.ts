// ==============================================================================
// HERMES JARVIS — OBSERVATION TRUTH HELPERS
//
// The Computer Operator modal used to print live-screen claims it never
// measured: a green "STANDBY: SCREEN SYNCHRONIZED" dot, a resolution of
// "0x0", and the *platform* string rendered in a "Resolution:" field. All three
// appeared even when the host desktop could not be observed at all, so an
// unobservable machine still looked like a healthy synchronized screen.
//
// These helpers derive every one of those labels from the observation that was
// actually returned, and hold at UNKNOWN/ILLUSTRATIVE until a real host
// observation exists.
// ==============================================================================

import type { ScreenObservation } from '../../types/computerOperator';

export type ScreenSyncState = 'ILLUSTRATIVE' | 'UNOBSERVED' | 'OBSERVED';

/** What the screen panel is actually showing, given the observation and its provenance. */
export function screenSyncState(
  observation: ScreenObservation | null,
  isPreview: boolean
): ScreenSyncState {
  if (isPreview) return 'ILLUSTRATIVE';
  if (!observation || observation.isAmbiguous) return 'UNOBSERVED';
  return 'OBSERVED';
}

/** Human-facing status line for the panel's state indicator. */
export function screenSyncLabel(
  observation: ScreenObservation | null,
  isPreview: boolean
): string {
  switch (screenSyncState(observation, isPreview)) {
    case 'ILLUSTRATIVE':
      return 'ILLUSTRATIVE PREVIEW: NOT REAL SCREEN STATE';
    case 'UNOBSERVED':
      return 'SCREEN NOT OBSERVED: HOST DESKTOP UNREACHABLE';
    default:
      return 'SCREEN OBSERVED FROM HOST';
  }
}

/**
 * The observation's platform, or UNKNOWN when nothing reported one.
 * This is a platform name, never a resolution — the panel previously printed it
 * in a "Resolution:" field.
 */
export function observationPlatformLabel(observation: ScreenObservation | null): string {
  const platform = observation?.platform;
  return platform ? `Platform: ${platform}` : 'Platform: UNKNOWN';
}

/**
 * The measured screen resolution, or UNKNOWN when the host never reported one.
 * A host that cannot be inspected reports `{ width: 0, height: 0 }`, which must
 * never be rendered as a dimension.
 */
export function observationResolutionLabel(observation: ScreenObservation | null): string {
  const res = observation?.screenResolution;
  if (!res || !(res.width > 0) || !(res.height > 0)) return 'UNKNOWN';
  return `${res.width}x${res.height}`;
}

/**
 * Why a semantic interpretation must be withheld, or null when the observation
 * is real and can be summarised.
 *
 * `ScreenInterpreter` always produces a confident "Screen showing ..." summary,
 * so rendering it against an illustrative preview or an unreachable host would
 * restate the same fabricated live-screen claim the rest of this panel refuses
 * to make.
 */
export function observationInterpretationNotice(
  observation: ScreenObservation | null,
  isPreview: boolean
): string | null {
  switch (screenSyncState(observation, isPreview)) {
    case 'ILLUSTRATIVE':
      return 'Interpretation withheld: the view above is an illustrative preview, not the live desktop.';
    case 'UNOBSERVED':
      return 'Interpretation withheld: the host desktop could not be observed, so no screen content is claimed.';
    default:
      return null;
  }
}

/**
 * The status line for the panel's state indicator.
 *
 * The panel printed a bare `OPERATOR ACTIVE: OBSERVING SCREEN` whenever a task
 * was running, even when `ScreenObserver` had served the built-in illustrative
 * preview — so the "we are watching the real desktop" claim sat directly beside
 * the honest `SCREEN NOT OBSERVED` / illustrative dot.
 */
export function observationOperatorStateLabel(
  observation: ScreenObservation | null,
  isPreview: boolean,
  isRunning = false
): string {
  const state = screenSyncState(observation, isPreview);
  if (isRunning) {
    switch (state) {
      case 'OBSERVED':
        return 'OPERATOR ACTIVE: OBSERVING SCREEN';
      case 'ILLUSTRATIVE':
        return 'OPERATOR ACTIVE: ILLUSTRATIVE PREVIEW (no live desktop)';
      default:
        return 'OPERATOR ACTIVE: SCREEN UNOBSERVED';
    }
  }
  return screenSyncLabel(observation, isPreview);
}

/**
 * The `ACTIVE APP:` readout.
 *
 * The panel printed `ACTIVE APP: {activeApplication || 'None'}` for every state,
 * including an illustrative preview and an unreachable host, where no foreground
 * application was ever read from the desktop.
 */
export function observationActiveAppLabel(
  observation: ScreenObservation | null,
  isPreview: boolean
): string {
  if (screenSyncState(observation, isPreview) !== 'OBSERVED') {
    return 'ACTIVE APP: NOT OBSERVED';
  }
  const app = observation?.activeApplication?.trim();
  return app ? `ACTIVE APP: ${app}` : 'ACTIVE APP: NOT REPORTED';
}

/**
 * The command-stream column header.
 *
 * `LIVE COMMAND STREAM & TELEMETRY` was hardcoded and printed above the
 * illustrative preview's synthetic frames, claiming a live telemetry feed that
 * does not exist for a preview.
 */
export function observationStreamHeader(isPreview: boolean): string {
  return isPreview
    ? 'ILLUSTRATIVE COMMAND STREAM (no live telemetry)'
    : 'COMMAND STREAM & EXECUTION LOG';
}

/** The reason an observation is ambiguous, when one was given. */
export function observationAmbiguityNotice(
  observation: ScreenObservation | null,
  isPreview: boolean
): string | null {
  if (isPreview) {
    return 'Illustrative preview only. The live desktop was not reached, so no screen state is claimed.';
  }
  if (observation?.isAmbiguous) {
    return observation.ambiguityReason || 'The host desktop could not be observed; state is UNKNOWN.';
  }
  return null;
}
