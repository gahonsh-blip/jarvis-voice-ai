/**
 * Backlog item 13 — zero fake success.
 *
 * The daemon's `SIGTERM` / `SIGINT` handlers in `server.ts` called
 * `persistMemory()` and then unconditionally `process.exit(0)`. `persistMemory()`
 * returns `false` when `jarvis_memory.json` cannot be written (read-only mount,
 * full disk, permission denied), so a shutdown whose final save was refused still
 * logged "shutting down gracefully" and exited 0 — indistinguishable, to the
 * operator or to any supervisor watching exit codes, from a clean shutdown that
 * had flushed everything. Every state change since the last successful save was
 * silently lost while the process reported success.
 *
 * The verdict below turns the discarded boolean into the process's own exit
 * status, so a refused final write is reported as the failure it is instead of
 * being laundered into a clean exit.
 */

export interface ShutdownOutcome {
  /** 0 only when the final state actually reached durable storage. */
  exitCode: 0 | 1;
  logLine: string;
}

export function shutdownOutcome(signal: string, persisted: boolean): ShutdownOutcome {
  if (persisted) {
    return {
      exitCode: 0,
      logLine: `[Daemon] ${signal} received. Final state persisted to durable storage; shutting down gracefully.`,
    };
  }
  return {
    exitCode: 1,
    logLine:
      `[Daemon] ${signal} received. FINAL STATE NOT PERSISTED — jarvis_memory.json could not be ` +
      `written, so every change since the last successful save is lost. Exiting with a non-zero ` +
      `code so a refused final save is not mistaken for a clean shutdown.`,
  };
}
