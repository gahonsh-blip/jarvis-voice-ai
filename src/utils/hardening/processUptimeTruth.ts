// =============================================================================
// HERMES JARVIS — JARVIS process uptime truth
//
// `oracleCloudState.uptimeHours` is derived from `Date.now() - DAEMON_BOOT_TIME`
// — the lifetime of *this Node process* (see the field comment in server.ts).
// It was printed as `Uptime: Nh` inside the Telegram reply titled
// "ORACLE CLOUD ARM VM STATUS", where a reader takes it as the *VM's* uptime —
// a control-plane fact this process never measures. The two surfaces also
// disagreed: the Oracle modal calls the same number "hours continuous" on an
// instance card.
//
// Nothing in this process queries the OCI control plane, so the instance uptime
// is not observable here. What is observable is the process lifetime, and the
// reply names it as exactly that. The number is not hidden — a process lifetime
// is a real measurement — only the false label is removed.
// =============================================================================

/**
 * Label a measured process lifetime as the *process* uptime. `hours` must come
 * from a real `Date.now() - bootTime` computation; a non-finite or negative
 * value is reported as unmeasured rather than rendered as a number.
 */
export function processUptimeLabel(hours: unknown): string {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours < 0) {
    return 'this JARVIS process: uptime not measured';
  }
  return `this JARVIS process: ${Math.floor(hours)}h`;
}
