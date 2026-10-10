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
