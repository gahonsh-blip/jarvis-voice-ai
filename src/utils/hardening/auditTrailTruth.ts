// ==============================================================================
// HERMES JARVIS — AUDIT TRAIL TRUTH
//
// The Security Matrix rendered its audit trail under a heading that promised
// "Real-Time Execution Logs", but `memoryState.auditLogs` was seeded on a cold
// start (and on any persisted file with an empty array) with three invented
// entries: a Level 1 repository read, a Level 2 LinkedIn draft and a Level 2
// client quotation, each stamped `status: 'EXECUTED'` with
// `verificationStatus`/`finalTruthState` both `'VERIFIED'`. Nothing in this
// process had performed those actions, so the operator's governance view
// presented un-performed external work as executed and verified.
//
// This module keeps the record's provenance explicit. An entry that this
// process actually appended to the trail is `recorded`; an entry that arrives
// without that provenance (a seed, or a legacy persisted row) is not, and is
// never counted or labelled as a verified event.
// ==============================================================================

/** Provenance marker stamped by `recordAuditEvent` on every real append. */
export const AUDIT_LOG_SOURCE_RECORDED = 'recorded';

export interface AuditLogLike {
  status?: string;
  verificationStatus?: string;
  finalTruthState?: string;
  /** Provenance marker; absent on seeds and legacy rows. */
  source?: string;
}

export interface NormalizedAuditLog {
  /** True only for an entry this process appended itself. */
  recorded: boolean;
  /**
   * True only when a recorded entry also carries a real provider
   * confirmation. An unrecorded entry can never be confirmed, whatever its
   * status string says.
   */
  confirmed: boolean;
  status: string;
  /** Short provenance label for the UI. */
  provenanceLabel: string;
}

export function describeAuditProvenance(recorded: boolean): string {
  return recorded ? 'recorded' : 'not recorded by this process';
}

export function normalizeAuditLog(log: AuditLogLike | null | undefined): NormalizedAuditLog {
  const recorded = log?.source === AUDIT_LOG_SOURCE_RECORDED;
  const status =
    typeof log?.status === 'string' && log.status ? log.status : 'UNKNOWN';
  const providerConfirmed =
    log?.verificationStatus === 'VERIFIED' || log?.finalTruthState === 'VERIFIED';
  return {
    recorded,
    confirmed: recorded && providerConfirmed,
    status: recorded ? status : 'NOT_RECORDED',
    provenanceLabel: describeAuditProvenance(recorded),
  };
}

/**
 * Count only entries this process recorded. A caller must not present the raw
 * array length as a count of verified events, because the length may include
 * unrecorded rows.
 */
export function auditTrailCounts(logs: AuditLogLike[] | null | undefined): {
  total: number;
  recorded: number;
} {
  const all = Array.isArray(logs) ? logs : [];
  const recorded = all.filter((l) => l?.source === AUDIT_LOG_SOURCE_RECORDED).length;
  return { total: all.length, recorded };
}

/** Honest one-line summary of the trail, e.g. `0 of 3 events recorded here`. */
export function describeAuditTrail(logs: AuditLogLike[] | null | undefined): string {
  const { total, recorded } = auditTrailCounts(logs);
  if (total === 0) return 'no events recorded';
  return `${recorded} of ${total} events recorded by this process`;
}
