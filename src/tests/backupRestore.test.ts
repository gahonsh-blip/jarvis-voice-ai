import { describe, it, expect } from 'vitest';
import { createBackup, restoreBackup, validateBackup, verifyBackup, BACKUP_FORMAT } from '../utils/hardening/backupRestore';

describe('createBackup', () => {
  it('captures the memory keys', () => {
    const backup = createBackup({ name: 'Gaurav', notes: [{ id: '1' }] });
    expect(backup.format).toBe(BACKUP_FORMAT);
    expect(backup.keyCount).toBe(2);
    expect(backup.data.name).toBe('Gaurav');
  });

  it('redacts credentials that leaked into memory', () => {
    const backup = createBackup({ note: 'token ghp_' + 'a'.repeat(40) });
    expect(JSON.stringify(backup)).not.toContain('ghp_' + 'a'.repeat(40));
  });

  it('drops prototype-polluting keys', () => {
    const memory = JSON.parse('{"__proto__":{"polluted":true},"name":"safe"}');
    const backup = createBackup(memory);
    expect(Object.keys(backup.data)).toEqual(['name']);
  });
});

describe('validateBackup', () => {
  it('accepts a well-formed backup', () => {
    expect(validateBackup(createBackup({ a: 1 })).ok).toBe(true);
  });

  it('rejects a non-object', () => {
    expect(validateBackup('not a backup').ok).toBe(false);
  });

  it('rejects an unknown format', () => {
    const result = validateBackup({ format: 'something-else', version: 1, data: {} });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('Unexpected format');
  });

  it('rejects a future version', () => {
    const result = validateBackup({ format: BACKUP_FORMAT, version: 99, data: {} });
    expect(result.ok).toBe(false);
  });

  it('detects a tampered key count', () => {
    const backup = createBackup({ a: 1, b: 2 });
    const result = validateBackup({ ...backup, keyCount: 5 });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('key count mismatch');
  });
});

describe('restoreBackup', () => {
  it('restores backed-up values', () => {
    const backup = createBackup({ name: 'Gaurav' });
    const current: Record<string, unknown> = { name: 'Someone' };
    const result = restoreBackup(current, backup);
    expect(result.ok).toBe(true);
    expect(current.name).toBe('Gaurav');
  });

  it('preserves keys that the backup does not mention', () => {
    // Restoring an old backup must not silently erase newer data.
    const backup = createBackup({ name: 'Gaurav' });
    const current: Record<string, unknown> = { name: 'Someone', recentNotes: ['keep me'] };
    const result = restoreBackup(current, backup);
    expect(current.recentNotes).toEqual(['keep me']);
    expect(result.preservedKeys).toContain('recentNotes');
  });

  it('refuses to restore an invalid backup', () => {
    const current: Record<string, unknown> = { name: 'Gaurav' };
    const result = restoreBackup(current, { format: 'bad' });
    expect(result.ok).toBe(false);
    expect(current.name).toBe('Gaurav');
  });

  it('refuses a backup carrying a prototype-polluting key', () => {
    const result = restoreBackup({}, {
      format: BACKUP_FORMAT,
      version: 1,
      createdAt: '',
      keyCount: 1,
      data: JSON.parse('{"__proto__":{"polluted":true}}'),
    });
    expect(result.ok).toBe(false);
  });
});

describe('verifyBackup', () => {
  it('round-trips a real backup', () => {
    const backup = createBackup({ name: 'Gaurav', notes: [], count: 3 });
    const result = verifyBackup(backup);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('fails on a corrupt backup', () => {
    const backup = createBackup({ a: 1 });
    expect(verifyBackup({ ...backup, version: 42 }).ok).toBe(false);
  });
});