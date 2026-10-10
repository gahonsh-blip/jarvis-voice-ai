// =============================================================================
// HERMES JARVIS — Controlled web fetch display truth (backlog item 13)
//
// `realWebFetch` (`server_tools.ts`) refuses a page that exposed nothing, and
// `classifyWebFetchContent` (`webFetchTruth.ts`) deliberately keeps an
// unobserved title as `null` rather than inventing the hostname. `title` is
// optional, so a fetch can honestly succeed with `title: undefined` — a page
// with real readable body text but no `<title>`/`og:title` tag.
//
// The Tools HUD (`AutonomousToolsModal.tsx`) rendered that undefined title
// straight into a styled header (`{webResult.title}`) and into the feedback
// line, so a successful fetch of a title-less page drew an empty title bar and
// `Successfully fetched and cleaned "undefined"` — a blank/undefined title
// presented as though the page had supplied one. A page whose title was never
// observed must be named as such, never rendered as an observed value.
// =============================================================================

/** Shown when the fetched page supplied no `<title>` / `og:title`. */
export const NO_WEB_TITLE_OBSERVED_LABEL =
  'Untitled page — the site returned no title';

/**
 * The title to display for a fetched page. Returns the observed title, or an
 * explicit "no title observed" label when the page exposed none. Never returns
 * an empty string or the literal `undefined`.
 */
export function webFetchDisplayTitle(observedTitle: unknown): string {
  if (typeof observedTitle !== 'string') return NO_WEB_TITLE_OBSERVED_LABEL;
  const trimmed = observedTitle.trim();
  return trimmed.length > 0 ? trimmed : NO_WEB_TITLE_OBSERVED_LABEL;
}

/**
 * The operator feedback line for a successful fetch. Names the observed title
 * when there is one; otherwise says plainly that the site returned no title
 * rather than inventing or rendering an empty one.
 */
export function webFetchSuccessNotice(observedTitle: unknown): string {
  if (typeof observedTitle !== 'string' || observedTitle.trim().length === 0) {
    return 'Fetched and cleaned readable page content, but the site returned no title.';
  }
  return `Fetched and cleaned "${observedTitle.trim()}"`;
}
