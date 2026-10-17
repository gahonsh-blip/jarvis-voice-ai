// ==============================================================================
// HERMES JARVIS — NIGHTLY-CHECK AUDIT TRUTH (backlog item 13)
//
// `runNightlyCheck()` marks the run record `COMPLETED` even when the sweep was
// partial, but it marks the receipt `DISPATCHED` in that case and reserves
// `VERIFIED` for a fully clean scan. The scheduler's audit row used to map its
// badge from `record.outcome` (`COMPLETED ? VERIFIED : FAILED`), so a partial
// sweep — repositories it could not reach — still rendered a green "confirmed"
// badge that was a superset of what the scan's own detail admitted.
//
// This helper derives the badge from the check's receipt outcome instead, so a
// non-verified scan can never be presented as a confirmed check. It lives here
// rather than inline in `server.ts` so the mapping is unit-tested directly.
// ==============================================================================

import type { ExecutionOutcome } from '../executionTruth';

/**
 * Audit-log status for a nightly check, derived from the check's own receipt.
 * Only `VERIFIED` (remote-confirmed, fully clean) yields `VERIFIED`; a refusal
 * yields `FAILED`; a dispatched-but-unconfirmed or otherwise non-verified sweep
 * yields `UNVERIFIED`.
 */
export function nightlyAuditBadge(outcome: ExecutionOutcome): 'VERIFIED' | 'FAILED' | 'UNVERIFIED' {
  if (outcome === 'VERIFIED') return 'VERIFIED';
  if (outcome === 'FAILED' || outcome === 'BLOCKED') return 'FAILED';
  return 'UNVERIFIED';
}

/**
 * The scheduler run-log line for a scheduled nightly check.
 *
 * The scheduled tick logged "Started Nightly Repository Check (03:00 AM IST)"
 * the moment the per-day marker landed — before the scan had produced anything —
 * and then discarded both the run-record and audit-row durability verdicts. On a
 * read-only volume or a full disk the durable history gained no run, yet the log
 * still asserted the check had started. This line is composed after the check
 * finishes and states only what was observed: the receipt outcome, the scan
 * counts, and whether the run record and audit row actually reached disk.
 */
export function nightlyRunLogLine(record: {
  receiptOutcome: ExecutionOutcome;
  scannedRepositories: number;
  unreachableRepositories: number;
  reposWithFailingCi: number;
  plannedSteps: number;
}, durability: {
  recorded: boolean;
  auditRecorded: boolean;
}): string {
  const stamp = new Date().toISOString();
  const parts: string[] = [];
  if (!durability.recorded) parts.push('run record NOT written to durable storage');
  if (!durability.auditRecorded) parts.push('audit row NOT written to durable storage');
  const suffix = parts.length > 0 ? ` — ${parts.join('; ')}` : '';
  return (
    `[${stamp}] Nightly Repository Check ${record.receiptOutcome}: ` +
    `${record.scannedRepositories} scanned, ${record.unreachableRepositories} unreachable, ` +
    `${record.reposWithFailingCi} with failing CI, ${record.plannedSteps} planned step(s)${suffix}`
  );
}
