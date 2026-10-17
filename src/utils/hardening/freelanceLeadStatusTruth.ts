// =============================================================================
// HERMES JARVIS — Freelance lead status update truth (backlog item 13)
//
// `POST /api/freelance/update-status` (`server.ts`) answered `success: true`
// and echoed the mutated record for every request that matched a stored lead.
// Two things were then claimed that had not been observed:
//
//  * a status the client supplied was a real pipeline state, when the route
//    wrote any string — `status: 'Bogus'` was stored and reported as a saved
//    change; and
//  * a change had occurred, when re-applying the status a lead already held
//    mutated nothing and still read as a successful save.
//
// The Freelance Pipeline modal sends fixed labels, so the failure is silent
// there; the endpoint is also reachable directly, where a caller reading the
// `success` flag cannot tell a real transition from a no-op.
//
// This module keeps the write and the claim apart: only a known status that
// actually differs from the stored one is applied and reported as applied.
// =============================================================================

/**
 * The pipeline states the server recognises. Mirrors the `FreelanceLead`
 * status union in `src/types.ts` plus the 'Lead Entered' label the intake
 * builder writes, so a status the UI can display is never rejected.
 */
export const FREELANCE_LEAD_STATUSES = [
  'Lead Entered',
  'New Inquiry',
  'AI Requirements Extracted',
  'Quotation Sent',
  'Followed Up',
  'In Progress',
  'Delivered',
  'Delivered & Closed',
] as const;

export type FreelanceLeadStatus = (typeof FREELANCE_LEAD_STATUSES)[number];

const KNOWN_STATUSES = new Set<string>(FREELANCE_LEAD_STATUSES);

export interface LeadStatusUpdateVerdict {
  /** True only when a known status that differs from the stored one was applied. */
  success: boolean;
  /** The status to store; null when nothing should be written. */
  status: FreelanceLeadStatus | null;
  /** Machine-readable outcome: APPLIED, UNCHANGED, UNKNOWN_STATUS, NO_STATUS. */
  outcome: 'APPLIED' | 'UNCHANGED' | 'UNKNOWN_STATUS' | 'NO_STATUS';
  message: string;
}

/**
 * Decide what a status-update request should actually do.
 *
 * `currentStatus` is the lead's stored status. A request that names an unknown
 * status, omits the status, or repeats the stored one is not an applied change
 * and must not be reported as one.
 */
export function classifyLeadStatusUpdate(
  requested: unknown,
  currentStatus: string
): LeadStatusUpdateVerdict {
  if (typeof requested !== 'string' || !requested.trim()) {
    return {
      success: false,
      status: null,
      outcome: 'NO_STATUS',
      message: 'A non-empty status string is required; no change was applied.',
    };
  }

  const status = requested.trim();
  if (!KNOWN_STATUSES.has(status)) {
    return {
      success: false,
      status: null,
      outcome: 'UNKNOWN_STATUS',
      message: `"${status}" is not a recognised pipeline status; no change was applied.`,
    };
  }

  if (status === currentStatus) {
    return {
      success: false,
      status: null,
      outcome: 'UNCHANGED',
      message: `Lead already has status "${status}"; no change was applied.`,
    };
  }

  return {
    success: true,
    status: status as FreelanceLeadStatus,
    outcome: 'APPLIED',
    message: `Lead status changed from "${currentStatus}" to "${status}".`,
  };
}
