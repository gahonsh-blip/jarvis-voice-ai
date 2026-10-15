// =============================================================================
// HERMES JARVIS — Nightly report truth (backlog item 13)
//
// The 10:30 PM IST Telegram routine (`checkAndRunSchedulerJobs` in `server.ts`)
// composed a fixed three-line report and pushed it whenever a Telegram chat was
// linked. Two of its three lines were claims the process had not observed:
//
//   * "today's work summary has been recorded" — no work-summary artifact is
//     written anywhere in this project. The only durable thing the tick records
//     is its own per-day run marker, so the line asserted a record that does not
//     exist; and
//   * "Memory Persistence: Synchronized" — asserted literally, with no read of
//     the store, on a volume that may be read-only or full.
//
// The "Commands Executed" line also read a count of commands *received* as a
// count of commands *executed*. This module builds the report from the facts the
// caller actually verified, and names an unverified store as NOT verified.
// =============================================================================

export interface NightlyReportFacts {
  /** The per-day run marker was read back from durable storage. */
  runMarkerDurable: boolean;
  /** The memory store file is present and parses. */
  memoryStoreReadable: boolean;
  /** This process is serving; its own pid. */
  daemonPid: number;
  /** Commands recorded this session (`memoryState.stats.totalCommands`). */
  commandsRecorded: number;
}

/**
 * The nightly Telegram report, built only from facts the caller read back. A
 * marker that did not reach disk is reported as not durable, and a store that
 * could not be re-read is reported as NOT VERIFIED — never as "Synchronized".
 */
export function buildNightlyReportText(facts: NightlyReportFacts): string {
  const summaryLine = facts.runMarkerDurable
    ? "today's nightly routine ran and its per-day run marker is in durable storage."
    : "today's nightly routine ran, but its per-day run marker did NOT reach durable storage.";
  const memoryLine = facts.memoryStoreReadable
    ? 'VERIFIED — the memory store was re-read from disk'
    : 'NOT VERIFIED — the memory store could not be read back from disk';
  return [
    '🌙 *HERMES NIGHTLY WORK REPORT (10:30 PM)*',
    '',
    `Sir, ${summaryLine}`,
    `• *Commands Recorded (session)*: ${facts.commandsRecorded}`,
    `• *Memory Persistence*: ${memoryLine}`,
    `• *Daemon*: this process is responding (pid ${facts.daemonPid})`,
  ].join('\n');
}
