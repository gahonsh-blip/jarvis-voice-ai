// =============================================================================
// HERMES JARVIS — YouTube summary reply truth (backlog item 13)
//
// `buildYouTubeSummary` (server_tools.ts) is careful: when a video exposes no
// transcript and no description it returns `source: 'none'` with an EMPTY
// `summary` and a `notice` explaining that nothing could be summarised. The
// Telegram reply in `server.ts` did not read any of that — it branched only on
// `success && videoInfo`, and `success` is always true, so it still rendered the
// confident `🎥 *YOUTUBE VIDEO SUMMARY*` heading with the title, channel and
// link, followed by a blank summary body. A caller saw the summary framing and
// reasonably read a summary that was never produced.
//
// The notice must lead with the fact that no summary exists, not sit in a
// subordinate line beneath an empty "SUMMARY" heading.
// =============================================================================

export interface YouTubeSummaryForNotice {
  summary: string;
  source: string;
  notice?: string;
}

/**
 * Return the warning that must be shown when a summariser result carries no
 * real summary text, or `null` when there is a genuine summary to display.
 *
 * A result counts as a real summary only when `summary` is non-empty AND its
 * `source` is not `'none'` — `source: 'none'` with any stray text is still not a
 * summary of the video.
 */
export function formatYouTubeSummaryNotice(result: YouTubeSummaryForNotice): string | null {
  const hasSummary =
    typeof result.summary === 'string' &&
    result.summary.trim().length > 0 &&
    result.source !== 'none';
  if (hasSummary) return null;

  const reason =
    result.notice?.trim() ||
    'the video exposes no transcript or description, so no content summary can be produced';
  return `No summary was produced for this video: ${reason} Only the video's metadata is shown above.`;
}
