// ==============================================================================
// HERMES JARVIS — BACKUP / RESTORE (backlog item 59)
//
// Snapshots and restores the persisted memory. Two properties matter more than
// completeness:
//
//   1. A backup must be restorable. A snapshot that throws on restore is worse
//      than none, because it is trusted. Every backup is validated before it is
//      returned.
//   2. Credentials must never leave in a backup. The snapshot is passed through
//      the redaction engine, so a token that found its way into notes does not
//      ride out in a backup file.
// ==============================================================================

import { redactObjectSecrets } from '../computerOperator/credentialRedactor';

export const BACKUP_FORMAT = 'hermes-jarvis-memory';
export const BACKUP_VERSION = 1;

export interface MemoryBackup {
  format: string;
  version: number;
  createdAt: string;
  /** Number of top-level keys captured, for a quick integrity check. */
  keyCount: number;
  data: Record<string, unknown>;
}

export interface RestoreResult {
  ok: boolean;
  /** Keys that were restored. */
  restoredKeys: string[];
  /** Keys present in the running memory but absent from the backup. */
  preservedKeys: string[];
  errors: string[];
}

/**
 * Builds a validated, redacted snapshot.
 *
 * Keys named like secrets are dropped entirely rather than redacted: a redacted
 * placeholder in a restore would overwrite the live credential with the string
 * "[REDACTED_SECRET]".
 */
export function createBackup(
  memory: Record<string, unknown>,
  now: Date = new Date(),
): MemoryBackup {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(memory)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    safe[key] = redactObjectSecrets(value);
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    keyCount: Object.keys(safe).length,
    data: safe,
  };
}

/** Checks that a value really is a restorable backup of this format. */
export function validateBackup(backup: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  const b = backup as Partial<MemoryBackup> | null;

  if (!b || typeof b !== 'object') {
    return { ok: false, errors: ['Backup is not an object.'] };
  }
  if (b.format !== BACKUP_FORMAT) {
    errors.push(`Unexpected format "${String(b.format)}"; expected "${BACKUP_FORMAT}".`);
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    errors.push(
      `Backup version ${String(b.version)} is not supported (this build reads up to ${BACKUP_VERSION}).`,
    );
  }
  if (!b.data || typeof b.data !== 'object' || Array.isArray(b.data)) {
    errors.push('Backup has no data object.');
  }
  if (typeof b.keyCount === 'number' && b.data && Object.keys(b.data).length !== b.keyCount) {
    errors.push(
      `Backup key count mismatch: header says ${b.keyCount}, data has ${Object.keys(b.data).length}.`,
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Merges a backup into current memory.
 *
 * Keys the backup does not mention are preserved, not cleared: restoring an old
 * backup should not silently erase data created since. A key present in both is
 * taken from the backup, which is the point of a restore.
 */
export function restoreBackup(
  current: Record<string, unknown>,
  backup: unknown,
): RestoreResult {
  const validation = validateBackup(backup);
  if (!validation.ok) {
    return { ok: false, restoredKeys: [], preservedKeys: [], errors: validation.errors };
  }

  const data = (backup as MemoryBackup).data;
  const restoredKeys: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return {
        ok: false,
        restoredKeys: [],
        preservedKeys: [],
        errors: [`Backup contains a forbidden key "${key}".`],
      };
    }
    current[key] = value;
    restoredKeys.push(key);
  }

  const preservedKeys = Object.keys(current).filter((k) => !(k in data));

  return { ok: true, restoredKeys, preservedKeys, errors: [] };
}

/** Round-trips a backup to prove it can actually be restored. */
export function verifyBackup(backup: MemoryBackup): { ok: boolean; errors: string[] } {
  const validation = validateBackup(backup);
  if (!validation.ok) return validation;

  const probe: Record<string, unknown> = {};
  const result = restoreBackup(probe, backup);
  if (!result.ok) return { ok: false, errors: result.errors };

  if (result.restoredKeys.length !== Object.keys(backup.data).length) {
    return {
      ok: false,
      errors: [
        `Round-trip restored ${result.restoredKeys.length} keys but the backup holds ${Object.keys(backup.data).length}.`,
      ],
    };
  }

  return { ok: true, errors: [] };
}