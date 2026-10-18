// ==============================================================================
// HERMES JARVIS — LIVE GPS WATCH TRUTH
//
// `LocationServicesModal.tsx` ran its live-watch control on a single boolean.
// `toggleLiveWatch()` set `isWatching = true` the moment the operator clicked
// "Start Live GPS Watch" — before `navigator.geolocation.watchPosition` had
// reported anything — and the HUD rendered its green `STREAMING` badge straight
// off that boolean. A permission prompt the operator never answered, a device
// with no fix, or a watch that was cancelled before the first reading therefore
// all showed a live, streaming position the device had not produced.
//
// This module derives the badge from the *observed* watch lifecycle: a real
// device fix is the only thing that may report `STREAMING`. Before the first
// reading the watch is `ACQUIRING`; a watch that errors is `INTERRUPTED`; a
// client with no Geolocation API is `UNSUPPORTED`.
// ==============================================================================

export type GeoWatchState =
  | 'IDLE'
  | 'ACQUIRING'
  | 'STREAMING'
  | 'INTERRUPTED'
  | 'UNSUPPORTED';

export interface GeoWatchBadge {
  /** Whether the badge should be rendered at all. */
  visible: boolean;
  label: string;
  /** True only when the active watch has produced a real device fix. */
  live: boolean;
  tone: 'ok' | 'wait' | 'warn';
}

/**
 * Render the live-watch badge from the observed watch state.
 *
 * `live` is true only for `STREAMING`, which is set from inside the
 * `watchPosition` success callback — a watch that has only been requested is
 * `ACQUIRING` and must never read as a live stream.
 */
export function liveWatchBadge(state: GeoWatchState): GeoWatchBadge {
  switch (state) {
    case 'STREAMING':
      return { visible: true, label: 'STREAMING', live: true, tone: 'ok' };
    case 'ACQUIRING':
      return { visible: true, label: 'ACQUIRING — NO FIX YET', live: false, tone: 'wait' };
    case 'INTERRUPTED':
      return { visible: true, label: 'WATCH INTERRUPTED', live: false, tone: 'warn' };
    case 'IDLE':
    case 'UNSUPPORTED':
    default:
      return { visible: false, label: '', live: false, tone: 'warn' };
  }
}

/** The start/stop control label, keyed on whether a watch is currently held. */
export function liveWatchToggleLabel(isWatching: boolean): string {
  return isWatching ? 'Stop Live Tracking' : 'Start Live GPS Watch';
}
