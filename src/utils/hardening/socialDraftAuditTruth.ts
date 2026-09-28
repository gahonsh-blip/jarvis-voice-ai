// ==============================================================================
// HERMES JARVIS — SOCIAL DRAFT AUDIT TRUTH
//
// The Security Matrix renders each audit row's `verificationStatus` /
// `finalTruthState` as a green "confirmed" badge. Three social routes appended
// their draft-staging event as `status: 'EXECUTED'` with both truth fields
// `'VERIFIED'`:
//
//   POST /api/social/generate                 (Level 2 draft)
//   POST /api/social/youtube/upload-draft      ("Level 4 Gate Staged")
//   POST /api/social/youtube/draft-test        ("Level 4 Gate Staged")
//
// None of them published anything. Each only wrote a local draft and registered
// a pending Level-4 approval request, so the governance view presented external
// work as executed and verified while the post it described was still
// `PENDING_APPROVAL` / `STANDBY` / `DRAFT`. The row even disagreed with the post
// object created by the same request.
//
// A staged draft is not an executed action. This builder returns the only
// honest truth triple for that event, and it can never emit a verified claim.
// ==============================================================================

export interface StagedDraftAuditFields {
  action: string;
  status: 'PENDING';
  verificationStatus: 'STANDBY';
  finalTruthState: 'DRAFT';
}

export interface StagedDraftAuditInput {
  platform: string;
  topic: string;
  /** Permission level of the approval this draft is waiting on. */
  level: number;
  /** Optional human-readable gate label, e.g. `Level 4 Gate Staged`. */
  gate?: string;
}

const clean = (v: string | undefined, fallback: string) =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback;

/**
 * Honest audit fields for a locally staged social draft. The returned triple
 * never asserts execution or verification, and the action text states plainly
 * that no external action was performed.
 */
export function stagedDraftAuditEntry(input: StagedDraftAuditInput): StagedDraftAuditFields {
  const platform = clean(input.platform, 'Social');
  const topic = clean(input.topic, 'untitled');
  const level = Number.isFinite(input.level) ? input.level : 4;
  const gate = clean(input.gate, `Level ${level} authorization`);
  return {
    action: `Staged ${platform} draft "${topic}" — awaiting ${gate}; no external action performed by this process`,
    status: 'PENDING',
    verificationStatus: 'STANDBY',
    finalTruthState: 'DRAFT',
  };
}

/**
 * True only when a truth triple is consistent with work that was actually
 * performed and confirmed. A staged draft must never satisfy this; it is used
 * to guard the route source against a regression to a verified claim.
 */
export function claimsVerifiedOutcome(fields: {
  verificationStatus?: string;
  finalTruthState?: string;
}): boolean {
  return fields.verificationStatus === 'VERIFIED' || fields.finalTruthState === 'VERIFIED';
}
