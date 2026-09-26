// ==============================================================================
// HERMES JARVIS — "SYNCED" IS A CLAIM ABOUT THE BACKEND, NOT ABOUT THE BROWSER
//
// The HUD header derived its sync pill from `navigator.onLine` alone and
// defaulted that value to true (`isOnline = useState(navigator.onLine)` when
// `navigator` is undefined, and the component prop default is also true). So the
// pill read green `SYNCED` whenever the *browser* believed it had a network
// path — including when the JARVIS backend was not answering at all, which is
// exactly the case this offline-first app is built for. "Synced" asserted that
// sustained localStorage state had reached the server, a fact no fetch had
// established.
//
// This module is a pure tri-state over two observed facts: browser connectivity
// and whether the backend actually answered. Only both together may read as
// SYNCED. Browser offline is honestly OFFLINE READY; browser online but no
// backend answer is LOCAL ONLY, never SYNCED and never "reconnected".
// ==============================================================================

export type SyncLiveness = 'SYNCED' | 'OFFLINE_READY' | 'LOCAL_ONLY';

/** The two independent observations the sync pill is allowed to depend on. */
export interface SyncLivenessShape {
  /** Browser connectivity (`navigator.onLine` / online-offline events). */
  browserOnline: boolean | null | undefined;
  /** Whether the backend answered the last request; null until one has. */
  serverReachable: boolean | null | undefined;
}

/**
 * SYNCED only when the browser is online and the backend was observed to
 * answer. OFFLINE_READY only when the browser is genuinely offline. Anything
 * else — no backend answer yet, or an observed failure while online — is
 * LOCAL_ONLY: the app is still running from local persistence.
 */
export function syncLiveness(state: SyncLivenessShape): SyncLiveness {
  if (state.browserOnline !== true) return 'OFFLINE_READY';
  return state.serverReachable === true ? 'SYNCED' : 'LOCAL_ONLY';
}

/** Pill text for the HUD header. Never prints SYNCED on an unobserved backend. */
export function syncStatusLabel(liveness: SyncLiveness): string {
  if (liveness === 'SYNCED') return 'SYNCED';
  if (liveness === 'OFFLINE_READY') return 'OFFLINE READY';
  return 'LOCAL ONLY — SERVER UNREACHABLE';
}

/**
 * Status line for the browser online/offline event. Regaining a network path is
 * not the same as the backend being reachable, so the reconnected claim is only
 * made once a probe succeeded.
 */
export function reconnectStatusText(probed: boolean): string {
  return probed ? 'BACKEND RECONNECTED' : 'NETWORK RESTORED • BACKEND NOT REACHABLE';
}
