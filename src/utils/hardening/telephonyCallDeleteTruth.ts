// HERMES JARVIS — telephony call-history deletion honesty.
//
// `DELETE /api/telephony/calls` and `DELETE /api/telephony/calls/:id`
// (`server.ts`) both answered `success: true` unconditionally: clearing an
// already-empty history, or deleting an id that was never recorded, still
// read as a completed deletion. The response asserted that call records were
// removed when the in-memory store was unchanged — the same fake-success
// shape item 13 exists to remove. A caller could not tell a real deletion
// from a no-op.

export type TelephonyCallDeletionVerdict =
  | { success: true; removed: number; outcome: 'DELETED'; message: string }
  | {
      success: false;
      removed: 0;
      outcome: 'NOTHING_TO_CLEAR' | 'NOT_FOUND';
      message: string;
    };

/**
 * Decide the verdict for a call-history deletion from what actually changed.
 *
 * `removed` is the real number of records the store lost. A `targetId` means
 * the caller asked to delete one call, so an unremoved id is `NOT_FOUND`;
 * without a target the caller asked to clear the history, so an unchanged
 * store is `NOTHING_TO_CLEAR`. Either way a no-op never reports success.
 */
export function classifyTelephonyCallDeletion(
  removed: number,
  targetId?: string
): TelephonyCallDeletionVerdict {
  if (!Number.isFinite(removed) || removed <= 0) {
    if (targetId) {
      return {
        success: false,
        removed: 0,
        outcome: 'NOT_FOUND',
        message: `No call with id "${targetId}" exists; nothing was deleted.`,
      };
    }
    return {
      success: false,
      removed: 0,
      outcome: 'NOTHING_TO_CLEAR',
      message: 'No call history to clear; nothing was deleted.',
    };
  }

  if (targetId) {
    return {
      success: true,
      removed,
      outcome: 'DELETED',
      message: `Call "${targetId}" deleted.`,
    };
  }

  return {
    success: true,
    removed,
    outcome: 'DELETED',
    message: `Cleared ${removed} call record(s).`,
  };
}
