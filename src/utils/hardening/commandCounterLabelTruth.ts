// =============================================================================
// HERMES JARVIS — Command counter label truth (backlog item 13)
//
// `memoryState.stats.totalCommands` is incremented at the moment a command is
// *received* (processMobileCommand, POST /api/chat), before any intent is
// classified and before anything is executed. The night proactive routine in
// `buildProactiveReports` published that number under the label
// "Total Commands Executed", so the 10:30 PM briefing credited work that was
// never performed — the same mislabel the nightly Telegram report already fixed
// (see nightlyReportTruth.ts, which renamed its line to "Commands Recorded").
//
// The counter can only ever answer "how many commands arrived", so the routine
// must not call it executed. This module owns the honest label and the sentence
// the routine renders, so the two cannot drift again.
// =============================================================================

/** The only thing `memoryState.stats.totalCommands` measures. */
export const COMMANDS_RECEIVED_LABEL = 'Total Commands Received';

/**
 * The night-routine insight line for the command counter. Names the number as a
 * count of commands *received* this session and says plainly that it is not a
 * count of executed actions, so the figure is never read as performed work.
 */
export function commandsReceivedInsight(totalCommands: number): string {
  const n = Number.isFinite(totalCommands) ? totalCommands : 0;
  return `${COMMANDS_RECEIVED_LABEL}: ${n} (received this session, not a count of executed actions)`;
}
