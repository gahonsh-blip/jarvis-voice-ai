// HERMES JARVIS — Computer Operator observe-route truth (backlog item 13).
//
// `POST /api/computer-operator/observe` answers honestly: it sets `observed`
// from `observationPerformed(observation, ScreenObserver.isHostBacked())`, so a
// run against the built-in illustrative view returns `observed: false`.
//
// `ComputerOperatorModal.observeScreen()` did not read that flag. It treated
// any 200 with a body `observation` as a host observation and returned
// `isPreview: false`, which forced `screenSyncState` to `OBSERVED` — the panel
// then printed `SCREEN OBSERVED FROM HOST` and a live-screen claim for a frame
// the server had just said was not observed. The same code path backs
// `handleRefreshScreen` and `handleSwitchTarget`.
//
// This classifier derives the preview flag from the server's own verdict, never
// from the presence of a body, so an unobserved response can only render as an
// illustrative preview.

import type { ScreenObservation } from '../../types/computerOperator';

export interface ObserveRouteResponse {
  /** The server's verdict. `false` when the host desktop was not observed. */
  observed?: boolean;
  observation?: ScreenObservation | null;
}

export interface ObserveRouteVerdict {
  /** The observation to render, or null when the response carried none. */
  observation: ScreenObservation | null;
  /**
   * True only when the server explicitly confirmed a host-backed observation.
   * A response that omits or denies `observed` is treated as a preview, never
   * as a live screen.
   */
  isPreview: boolean;
}

export function classifyHostObservation(body: ObserveRouteResponse | null | undefined): ObserveRouteVerdict {
  const observation = body?.observation ?? null;
  if (!observation) {
    return { observation: null, isPreview: true };
  }
  return { observation, isPreview: body?.observed !== true };
}
