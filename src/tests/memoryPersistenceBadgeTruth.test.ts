import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  memoryPersistenceBadge,
  memoryPersistenceBadgeTitle,
  memoryPersistenceTone,
} from '../utils/hardening/memoryPersistenceBadgeTruth';

// Item 13 (Zero-fake-success). The Memory Bank modal header carried a fixed
// `LocalStorage Synced` badge — a compile-time constant asserting a durable
// local save for every render, including private mode / full disk / no
// localStorage where `saveLocalMemory` returns false and nothing reaches disk.
// These tests pin the helper contract and the wiring that derives the badge
// from the observed write verdict.
describe('memory persistence badge truth', () => {
  it('only an observed successful write reads as synced', () => {
    expect(memoryPersistenceBadge(true)).toBe('LocalStorage Synced');
    expect(memoryPersistenceTone(true)).toBe('ok');
  });

  it('an observed refused write names the revert instead of claiming a save', () => {
    expect(memoryPersistenceBadge(false)).toContain('NOT SAVED');
    expect(memoryPersistenceBadge(false)).not.toContain('Synced');
    expect(memoryPersistenceTone(false)).toBe('warn');
    expect(memoryPersistenceBadgeTitle(false)).toContain('reverts on reload');
  });

  it('no write observed is stated as unknown, never upgraded to synced', () => {
    for (const state of [null, undefined]) {
      expect(memoryPersistenceBadge(state)).toContain('UNKNOWN');
      expect(memoryPersistenceBadge(state)).not.toContain('Synced');
      expect(memoryPersistenceTone(state)).toBe('unknown');
    }
  });
});

describe('MemoryModal derives its persistence badge', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../components/MemoryModal.tsx'),
    'utf8',
  );
  const appSrc = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');

  it('no longer hardcodes the LocalStorage Synced literal', () => {
    // The old literal may only survive inside the helper's return value, not as
    // an unconditional JSX child.
    expect(src).not.toMatch(/>\s*LocalStorage Synced\s*</);
  });

  it('renders the badge from the helper, keyed on persistenceState', () => {
    expect(src).toContain('memoryPersistenceBadge(persistenceState)');
    expect(src).toContain('memoryPersistenceBadgeTitle(persistenceState)');
    expect(src).toContain('persistenceState?: MemoryPersistenceState');
  });

  it('App observes the real saveLocalMemory verdict and passes it down', () => {
    expect(appSrc).toContain('setMemoryPersistenceState(saveLocalMemory(memory))');
    expect(appSrc).toContain('persistenceState={memoryPersistenceState}');
  });
});
