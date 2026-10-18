// ==============================================================================
// HERMES JARVIS — MEMORY BANK PERSISTENCE BADGE TRUTH (backlog item 13)
//
// The Memory Bank modal (`src/components/MemoryModal.tsx`) carried a fixed
// header badge reading `LocalStorage Synced`. Nothing in the component wrote to
// or read from `localStorage`, and the badge was a compile-time constant, so it
// asserted a durable local save for every render — including a private-mode
// context, a full disk, or a non-browser host where `saveLocalMemory` returns
// `false` and nothing reaches disk. The edit would then revert on the next
// reload while the header still claimed the store was synced.
//
// This module turns the real verdict of the last memory-store write into the
// badge text, mirroring `billingEntitlementTruth.ts`: only an observed `true`
// may read as synced; an observed refusal names the revert; and no observation
// yet is stated as unknown rather than upgraded to a claim.
// ==============================================================================

/** The observed verdict of the last memory-store write, or null before one. */
export type MemoryPersistenceState = boolean | null | undefined;

export type MemoryPersistenceTone = 'ok' | 'warn' | 'unknown';

/** Compact badge text. Never asserts a local save that was not observed. */
export function memoryPersistenceBadge(state: MemoryPersistenceState): string {
  if (state === true) return 'LocalStorage Synced';
  if (state === false) return 'NOT SAVED — storage refused';
  return 'Persistence UNKNOWN — no write observed';
}

/** Long-form tooltip explaining what the badge's state rests on. */
export function memoryPersistenceBadgeTitle(state: MemoryPersistenceState): string {
  if (state === true) {
    return 'The last memory-store write was accepted by localStorage; the stored copy matches the in-session memory.';
  }
  if (state === false) {
    return 'The last memory-store write was refused by the browser (quota exceeded, private mode, or no localStorage); this change reverts on reload.';
  }
  return 'No memory-store write has been observed since load, so the persistence state is not asserted.';
}

/** Colour tone for the badge, derived from the same observed verdict. */
export function memoryPersistenceTone(state: MemoryPersistenceState): MemoryPersistenceTone {
  if (state === true) return 'ok';
  if (state === false) return 'warn';
  return 'unknown';
}
