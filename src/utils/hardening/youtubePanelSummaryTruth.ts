// =============================================================================
// HERMES JARVIS — YouTube panel summary truth (backlog item 13)
//
// `buildYouTubeSummary` (server_tools.ts) is careful: when a video exposes no
// transcript and no description it returns `source: 'none'` with an EMPTY
// `summary` and a `notice` explaining that nothing could be summarised. The
// Telegram reply in `server.ts` was taught to lead with that truth
// (`formatYouTubeSummaryNotice`), but the in-app panel in
// `AutonomousToolsModal.tsx` was not.
//
// In that panel the empty summary was papered over by three fallback strings:
//   • the summary body read "No summary text is available for this video."
//   • the Key Takeaways tab read "Key takeaways are formatted inside the
//     Executive Summary view above." — claiming takeaways existed somewhere
//   • Copy Summary copied `ytResult.summary || ''`, i.e. an empty clipboard,
//     while the toast still said "Summary copied to clipboard!"
//
// None of those invent content, but together they dress an empty result as a
// produced summary. These helpers give the panel one honest source of truth.
// =============================================================================

export interface YouTubePanelSummaryForCopy {
  summary?: string | null;
  source?: string | null;
  notice?: string | null;
}

/**
 * A result counts as a real summary only when `summary` is non-empty AND its
 * `source` is not `'none'` — `source: 'none'` with stray text is still not a
 * summary of the video. Mirrors `formatYouTubeSummaryNotice`.
 */
export function hasRealYouTubeSummary(result: YouTubePanelSummaryForCopy): boolean {
  const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
  return summary.length > 0 && result.source !== 'none';
}

/**
 * The text the panel's "Copy Summary" button must place on the clipboard.
 *
 * When a real summary exists it is copied verbatim. When none was produced the
 * clipboard receives the explanatory notice — never an empty string that makes
 * the "Summary copied" toast a lie.
 */
export function youtubeSummaryCopyText(result: YouTubePanelSummaryForCopy): string {
  if (hasRealYouTubeSummary(result)) {
    return typeof result.summary === 'string' ? result.summary : '';
  }
  const reason =
    (typeof result.notice === 'string' && result.notice.trim()) ||
    'no transcript or description is available, so no content summary can be produced';
  return `No summary was produced for this video: ${reason}`;
}

/**
 * The Key Takeaways tab's empty-state label. It must not claim takeaways exist
 * somewhere when no summary was produced at all.
 */
export function youtubeTakeawaysEmptyLabel(result: YouTubePanelSummaryForCopy): string {
  return hasRealYouTubeSummary(result)
    ? 'Key takeaways are formatted inside the Executive Summary view above.'
    : 'No key takeaways — no summary was produced for this video.';
}
