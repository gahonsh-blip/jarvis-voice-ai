// ==============================================================================
// HERMES JARVIS — TOOL DISPATCH TRUTH
//
// Several `/api/chat` intents wrap a real tool call (`realFsList`,
// `realWebFetch`, `realGithubStatus`/`realGithubRepos`, `summarizeYouTubeVideo`
// and the local math evaluator) but set `actionExecuted = true` no matter what
// the tool returned. When the tool failed or produced nothing usable the route
// still spoke a confident "complete" line and incremented the user-visible
// "Autonomous Actions Executed" counter, so a check that changed nothing was
// recorded as performed work.
//
// A tool that ran is only an executed action when the tool itself reports
// success. These helpers derive both the `actionExecuted` flag and the honest
// spoken sentence from the observed result, never from the intent.
// ==============================================================================

/** The subset of a tool result that decides whether work actually happened. */
export interface ToolRunResult {
  success: boolean;
  error?: string;
}

/**
 * Whether a tool call counts as an executed action. Only a tool that reported
 * success did work; a failure must not be spoken or counted as success.
 */
export function toolActionExecuted(result: ToolRunResult): boolean {
  return result.success === true;
}

/**
 * Honest spoken reply for a tool call. On success the caller's confirmation
 * line is spoken; on failure the tool's own error is surfaced instead so the
 * operator is never told a failed check succeeded.
 */
export function toolActionResultReply(
  result: ToolRunResult,
  successReply: string,
  failureLabel: string,
  language: string
): string {
  if (result.success) return successReply;
  const reason = result.error || 'no result was returned';
  const hi = language.startsWith('hi');
  return hi
    ? `${failureLabel} विफल रहा: ${reason}। कोई कार्य निष्पादित नहीं हुआ।`
    : `${failureLabel} failed: ${reason}. No action was executed.`;
}

/**
 * Counts files a listing/search tool actually returned. A result that reports
 * success but an absent/empty list contributes zero, so a status line can never
 * inflate the count.
 */
export function countedItems(result: { items?: unknown[] | null }): number {
  return Array.isArray(result.items) ? result.items.length : 0;
}
