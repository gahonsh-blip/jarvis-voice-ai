// =============================================================================
// HERMES JARVIS — GitHub connection status display truth (backlog item 13)
//
// The Tools HUD (`AutonomousToolsModal.tsx`) rendered its GitHub banner from
// `githubStatus` seeded to `null`, which is also the value it holds when
// `POST /api/tools/github/status` has not answered yet (or answered with a
// non-OK response — `fetchGithubData` read `.json()` without checking `res.ok`
// and swallowed a network error in a bare `catch`). Two pre-fetch states were
// therefore rendered as observed facts:
//
//   * the status line fell back to the literal `Inspecting GitHub connection...`,
//     presented as though a connection probe were in flight, and
//   * the badge fell through to the amber branch and read `NOT CONNECTED` —
//     a claim about the operator's GitHub account drawn from a value nobody
//     fetched.
//
// `connected` is only meaningful once the endpoint has actually answered. Until
// then the honest display is UNKNOWN, never a fabricated "Inspecting" or a
// "NOT CONNECTED" drawn from the initial `null`.
// =============================================================================

/** Shown until `/api/tools/github/status` has actually answered. */
export const GITHUB_STATUS_UNKNOWN_LABEL =
  'GitHub status UNKNOWN — /api/tools/github/status has not answered';

/**
 * The connection badge text. `observed` is true only once the status endpoint
 * returned an OK response; while it is false the badge reads UNKNOWN, so the
 * pre-fetch `null` can never render as `NOT CONNECTED`. An OK response that
 * carries no boolean `connected` also reads UNKNOWN rather than defaulting to a
 * claim in either direction.
 */
export function githubStatusBadge(observed: boolean, connected: unknown): string {
  if (!observed) return 'STATUS UNKNOWN';
  if (connected === true) return 'AUTHENTICATED';
  if (connected === false) return 'NOT CONNECTED';
  return 'STATUS UNKNOWN';
}

/**
 * The status line text. Names the observed endpoint message when one was
 * supplied; otherwise states plainly that the status has not been observed.
 * Never returns the pre-fetch `Inspecting GitHub connection...` placeholder,
 * which read as an in-flight probe that no code path ever ran.
 */
export function githubStatusMessage(message: unknown, observed: boolean): string {
  if (!observed) return GITHUB_STATUS_UNKNOWN_LABEL;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }
  return 'GitHub status endpoint answered without a message.';
}

/** Display tone for the banner: connected, disconnected, or not yet observed. */
export function githubStatusTone(observed: boolean, connected: unknown): 'connected' | 'disconnected' | 'unknown' {
  if (!observed) return 'unknown';
  if (connected === true) return 'connected';
  if (connected === false) return 'disconnected';
  return 'unknown';
}

