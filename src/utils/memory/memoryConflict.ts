// ==============================================================================
// HERMES JARVIS — MEMORY CONFLICT RESOLUTION (backlog item 39)
//
// The browser holds an offline copy of memory while the server holds the
// authoritative one. When the device reconnects, both may have changed. These
// helpers merge the two deterministically and never guess: a genuine conflict
// (both sides edited the same entity) keeps both versions and flags it, rather
// than silently picking a winner and losing data.
// ==============================================================================

export interface SyncedNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt?: string;
}

export interface SyncedKeyValue {
  key: string;
  value: string;
  /** ISO timestamp of the last write on either side, when known. */
  updatedAt?: string;
}

export interface MemorySnapshot {
  name?: string;
  notes: SyncedNote[];
  customKeyValues: Record<string, string>;
  /** ISO timestamp of the last write per key, when the caller tracks one. */
  keyTimestamps?: Record<string, string>;
}

export interface MergeConflict {
  entity: 'note' | 'key' | 'name';
  id: string;
  local: string;
  remote: string;
  /** How the conflict was resolved. */
  resolution: 'kept_local' | 'kept_remote' | 'kept_both' | 'flagged';
}

export interface MergeResult {
  merged: MemorySnapshot;
  conflicts: MergeConflict[];
  /** True when at least one conflict needs a human decision. */
  requiresAttention: boolean;
}

/**
 * Merge an offline snapshot with the server snapshot.
 *
 * Rules, in order of precedence:
 *   1. An entity that exists on only one side is kept (nothing was deleted
 *      concurrently, so there is no conflict).
 *   2. An entity identical on both sides is kept once.
 *   3. An entity that differs is a conflict. Notes are kept in both versions so
 *      no writing is lost; scalar keys prefer the newer `updatedAt`, and when
 *      neither side has a timestamp the conflict is flagged for a human.
 *
 * Deletions are not inferred: a missing entity is treated as "not known here",
 * not as "deleted there". Inferring deletion from absence is how syncs silently
 * destroy data.
 */
export function mergeMemorySnapshots(
  local: MemorySnapshot,
  remote: MemorySnapshot,
): MergeResult {
  const conflicts: MergeConflict[] = [];

  const localNotes = new Map(local.notes.map((n) => [n.id, n]));
  const remoteNotes = new Map(remote.notes.map((n) => [n.id, n]));

  const mergedNotes: SyncedNote[] = [];

  for (const [id, localNote] of localNotes) {
    const remoteNote = remoteNotes.get(id);
    if (!remoteNote) {
      mergedNotes.push(localNote);
      continue;
    }

    const sameText =
      localNote.title === remoteNote.title && localNote.content === remoteNote.content;
    if (sameText) {
      mergedNotes.push(pickNewerNote(localNote, remoteNote));
      continue;
    }

    // Both sides changed or they disagree. Keep both so nothing is lost.
    const localNewer = isLocalNoteNewer(localNote, remoteNote);
    const winner = localNewer ? localNote : remoteNote;
    const loser = localNewer ? remoteNote : localNote;
    mergedNotes.push(winner);
    mergedNotes.push({
      ...loser,
      id: `${loser.id}~conflict-${Date.now()}`,
      title: `${loser.title} (conflicting edit)`,
    });
    conflicts.push({
      entity: 'note',
      id,
      local: `${localNote.title}: ${localNote.content}`,
      remote: `${remoteNote.title}: ${remoteNote.content}`,
      resolution: 'kept_both',
    });
  }

  for (const [id, remoteNote] of remoteNotes) {
    if (!localNotes.has(id)) mergedNotes.push(remoteNote);
  }

  const mergedKeyValues: Record<string, string> = { ...remote.customKeyValues };
  for (const [key, value] of Object.entries(local.customKeyValues)) {
    if (!(key in remote.customKeyValues)) {
      mergedKeyValues[key] = value;
      continue;
    }
    if (remote.customKeyValues[key] === value) continue;

    // Both sides hold a different value. Prefer the later writer only when both
    // timestamps are known; otherwise flag it instead of guessing.
    const localAt = local.keyTimestamps?.[key];
    const remoteAt = remote.keyTimestamps?.[key];
    if (localAt && remoteAt) {
      const localNewer = Date.parse(localAt) >= Date.parse(remoteAt);
      mergedKeyValues[key] = localNewer ? value : remote.customKeyValues[key];
      conflicts.push({
        entity: 'key',
        id: key,
        local: value,
        remote: remote.customKeyValues[key],
        resolution: localNewer ? 'kept_local' : 'kept_remote',
      });
    } else {
      conflicts.push({
        entity: 'key',
        id: key,
        local: value,
        remote: remote.customKeyValues[key],
        resolution: 'flagged',
      });
    }
  }

  let name = remote.name;
  if (local.name && remote.name && local.name !== remote.name) {
    conflicts.push({
      entity: 'name',
      id: 'name',
      local: local.name,
      remote: remote.name,
      resolution: 'flagged',
    });
  } else if (local.name && !remote.name) {
    name = local.name;
  }

  return {
    merged: { name, notes: mergedNotes, customKeyValues: mergedKeyValues },
    conflicts,
    requiresAttention: conflicts.some((c) => c.resolution === 'flagged'),
  };
}

function pickNewerNote(a: SyncedNote, b: SyncedNote): SyncedNote {
  return isLocalNoteNewer(a, b) ? a : b;
}

function isLocalNoteNewer(local: SyncedNote, remote: SyncedNote): boolean {
  const localAt = Date.parse(local.updatedAt ?? local.createdAt ?? '');
  const remoteAt = Date.parse(remote.updatedAt ?? remote.createdAt ?? '');
  if (Number.isNaN(localAt) || Number.isNaN(remoteAt)) return false;
  return localAt >= remoteAt;
}