// =============================================================================
// HERMES JARVIS — Scheduler run truth (backlog item 13)
//
// `checkAndRunSchedulerJobs` advanced the per-day dedupe marker and logged
// "Executed <job>" for every routine the moment its time window opened. Two
// things were then claimed that had not been observed:
//
//  * the routine had run, when the only action the process takes is to compose
//    and attempt a Telegram message — the marker, not the work, is what the
//    tick actually performed; and
//  * for the two routines that push a message, the push had succeeded, when
//    `sendRealTelegramMessage` swallows every failure and returns null.
//
// The marker must still be stamped (otherwise a 15-minute window would retry
// the tick every 30 seconds all window long), so this module keeps the stamp
// and the claim apart: the scheduler records what it observed and these
// helpers turn that into a log line that does not overstate it.
// =============================================================================

export interface SchedulerPushOutcome {
  attempted: boolean;
  delivered: boolean;
  detail?: string;
}

/**
 * The log line for one routine tick.
 *
 * `delivered === true` is the only case that says the message reached Telegram.
 * A failed or absent push names the routine as executed-but-undelivered; a
 * routine with no push at all is marked as having advanced its schedule only,
 * because composing the local plan is all this process did.
 */
export function schedulerRunLogLine(
  name: string,
  push: SchedulerPushOutcome,
): string {
  const stamp = new Date().toISOString();
  if (push.delivered) {
    return `[${stamp}] ${name}: message delivered to Telegram${
      push.detail ? ` (${push.detail})` : ''
    }`;
  }
  if (push.attempted) {
    return `[${stamp}] ${name}: executed, but message NOT delivered to Telegram${
      push.detail ? ` — ${push.detail}` : ''
    }`;
  }
  return `[${stamp}] ${name}: schedule advanced (no Telegram push in this environment)`;
}
