// =============================================================================
// HERMES JARVIS — Offline memory-sync truth (backlog item 13)
//
// `POST /api/memory/sync` reconciled an offline snapshot with the authoritative
// server copy. `mergeMemorySnapshots` correctly detects a name that differs on
// both sides and flags it as a conflict for a human — but the route then wrote
// the client-supplied name into the server anyway and returned it in `merged`.
// The response therefore claimed the local name had been merged while the
// authoritative record was silently overwritten: the fake-success shape this
// item removes.
//
// The sync itself is not an error when nothing new arrives — a reconnecting
// client must be able to clear its queue — so the route keeps a 200 and instead
// states plainly what was stored and whether the name was applied.
// =============================================================================

import type { MemorySnapshot, MergeResult } from '../memory/memoryConflict';

export type MemorySyncOutcome = 'APPLIED' | 'NAME_CONFLICT' | 'NOTHING_TO_APPLY';

export interface MemorySyncVerdict {
  /** Whether anything was written to the authoritative memory. */
  stored: boolean;
  /** Whether the client-supplied name was written. False when it was flagged. */
  nameApplied: boolean;
  outcome: MemorySyncOutcome;
  /** True when a conflict needs a human decision before the values converge. */
  requiresAttention: boolean;
  message: string;
}

const notesChanged = (merged: MemorySnapshot['notes'], remote: MemorySnapshot['notes']): boolean => {
  if (merged.length !== remote.length) return true;
  const remoteIds = new Set(remote.map((n) => n.id));
  return merged.some((n) => !remoteIds.has(n.id));
};

const keyValuesChanged = (
  merged: Record<string, string>,
  remote: Record<string, string>,
): boolean => {
  const keys = new Set([...Object.keys(merged), ...Object.keys(remote)]);
  for (const key of keys) {
    if (merged[key] !== remote[key]) return true;
  }
  return false;
};

/**
 * Decide what the merge actually stored. A differing name is never applied: it
 * is reported as a conflict so the caller keeps the authoritative value and a
 * human picks the winner, instead of the offline copy overwriting the server.
 */
export function classifyMemorySync(result: MergeResult, remote: MemorySnapshot): MemorySyncVerdict {
  const nameConflict = result.conflicts.some(
    (c) => c.entity === 'name' && c.resolution === 'flagged',
  );
  const nameApplied =
    !nameConflict && result.merged.name !== undefined && result.merged.name !== remote.name;
  const stored =
    nameApplied ||
    notesChanged(result.merged.notes, remote.notes) ||
    keyValuesChanged(result.merged.customKeyValues, remote.customKeyValues);

  if (nameConflict) {
    return {
      stored,
      nameApplied: false,
      outcome: 'NAME_CONFLICT',
      requiresAttention: true,
      message:
        'The offline name differs from the stored one and was not applied. Confirm which name to keep.',
    };
  }

  if (!stored) {
    return {
      stored: false,
      nameApplied: false,
      outcome: 'NOTHING_TO_APPLY',
      requiresAttention: result.requiresAttention,
      message: 'The offline snapshot matched the stored memory; nothing was changed.',
    };
  }

  return {
    stored: true,
    nameApplied,
    outcome: 'APPLIED',
    requiresAttention: result.requiresAttention,
    message: 'Offline snapshot reconciled with the stored memory.',
  };
}
