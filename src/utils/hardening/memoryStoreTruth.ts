// ==============================================================================
// HERMES JARVIS — MEMORY-STORE PERSISTENCE TRUTH (backlog item 13)
//
// The four Memory Bank handlers in `src/App.tsx` (name change, custom key-value
// fact, note delete, note add) each wrote the local memory copy with a bare
// `saveLocalMemory(...)` call and discarded its boolean result:
//
//   handleUpdateName      → saveLocalMemory(updatedMemory)   // result dropped
//   handleAddCustomKey    → saveLocalMemory(updatedMemory)   // result dropped
//   handleDeleteNote      → saveLocalMemory(updatedMemory)   // result dropped
//   handleSaveNotepadNote → saveLocalMemory(updatedMemory)   // result dropped
//
// `saveLocalMemory` returns `false` when the browser refuses the write (quota
// exceeded, private mode, or a non-browser host with no `localStorage`), and the
// React state is still updated, so the UI shows the new name / fact / note as
// applied. Nothing is on disk, and the change reverts on the next reload — the
// exact fake-success shape item 13 removes. The offline command path was already
// fixed to gate its announcement on the captured result; these four handlers
// were the remaining discarded-result sites on the memory store.
//
// These helpers make the real write verdict visible without replacing the React
// state update (the operator still sees their edit applied in-session). A failed
// write produces a short notice that says plainly the change is not durable and
// will revert on reload.
// ==============================================================================

export type MemoryStoreWriteTone = 'success' | 'warn';

export interface MemoryStoreWriteResult {
  /** The result the storage writer actually returned. */
  saved: boolean;
  tone: MemoryStoreWriteTone;
  /** Short label for a badge. */
  label: string;
  /** Full sentence for an inline notice; empty when the write landed. */
  notice: string;
}

/**
 * Turns the real `saveLocalMemory` verdict into a UI result. Only a landed write
 * is silent; a refused write names the change and states the reload revert.
 */
export function classifyMemoryStoreWrite(
  saved: boolean,
  what: string,
): MemoryStoreWriteResult {
  const target = what.trim() || 'This memory change';
  if (saved) {
    return { saved: true, tone: 'success', label: 'Saved', notice: '' };
  }
  return {
    saved: false,
    tone: 'warn',
    label: 'Not saved',
    notice: `${target} was NOT saved to local storage; this change reverts on reload.`,
  };
}

export type SyncQueueWriteTone = 'success' | 'warn';

export interface SyncQueueWriteResult {
  /** The result `queuePendingSync` actually returned. */
  queued: boolean;
  tone: SyncQueueWriteTone;
  /** Short label for a badge. */
  label: string;
  /** Full sentence for an inline notice; empty when the item was queued. */
  notice: string;
}

/**
 * Turns the real `queuePendingSync` verdict into a UI result for the offline
 * fallback path of the four Memory Bank handlers. When the server write fails
 * the change is meant to be replayed later from the pending-sync queue, but
 * `queuePendingSync` returns `false` when it cannot write that queue (quota
 * exceeded, private mode, no `localStorage`). The handlers called it as a bare
 * statement, so a refused queue left the console reading "saved to localStorage
 * and queued for sync" while the server would never receive the change. Only a
 * landed queue is silent; a refused queue names the change and states that it
 * stays on this device.
 */
export function classifySyncQueueWrite(
  queued: boolean,
  what: string,
): SyncQueueWriteResult {
  const target = what.trim() || 'This change';
  if (queued) {
    return { queued: true, tone: 'success', label: 'Queued', notice: '' };
  }
  return {
    queued: false,
    tone: 'warn',
    label: 'Not queued',
    notice: `${target} could not be queued for server sync; it stays on this device only and the server will not receive it until you retry.`,
  };
}
