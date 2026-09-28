import { describe, it, expect } from 'vitest';
import { mergeMemorySnapshots, type MemorySnapshot } from '../utils/memory/memoryConflict';

const note = (id: string, title: string, content: string, createdAt = '2026-01-01T00:00:00Z', updatedAt?: string) => ({
  id,
  title,
  content,
  createdAt,
  updatedAt,
});

const snapshot = (over: Partial<MemorySnapshot> = {}): MemorySnapshot => ({
  name: '',
  notes: [],
  customKeyValues: {},
  ...over,
});

describe('mergeMemorySnapshots', () => {
  it('keeps notes that exist on only one side', () => {
    const result = mergeMemorySnapshots(
      snapshot({ notes: [note('a', 'A', 'local only')] }),
      snapshot({ notes: [note('b', 'B', 'remote only')] }),
    );
    expect(result.merged.notes.map((n) => n.id).sort()).toEqual(['a', 'b']);
    expect(result.conflicts).toEqual([]);
  });

  it('keeps an identical note once', () => {
    const shared = note('a', 'A', 'same');
    const result = mergeMemorySnapshots(
      snapshot({ notes: [shared] }),
      snapshot({ notes: [{ ...shared }] }),
    );
    expect(result.merged.notes).toHaveLength(1);
    expect(result.conflicts).toEqual([]);
  });

  it('keeps both versions when the same note was edited differently', () => {
    const result = mergeMemorySnapshots(
      snapshot({ notes: [note('a', 'A', 'local edit', '2026-01-01T00:00:00Z', '2026-02-01T00:00:00Z')] }),
      snapshot({ notes: [note('a', 'A', 'remote edit', '2026-01-01T00:00:00Z', '2026-01-15T00:00:00Z')] }),
    );

    expect(result.merged.notes).toHaveLength(2);
    // The newer edit is kept under the original id.
    expect(result.merged.notes.find((n) => n.id === 'a')?.content).toBe('local edit');
    expect(result.merged.notes.some((n) => n.id.startsWith('a~conflict-'))).toBe(true);
    expect(result.conflicts[0].resolution).toBe('kept_both');
  });

  it('never treats a missing note as a deletion', () => {
    // The server has a note the client never saw; it must survive.
    const result = mergeMemorySnapshots(snapshot(), snapshot({ notes: [note('server', 'S', 'keep me')] }));
    expect(result.merged.notes.map((n) => n.id)).toEqual(['server']);
  });

  it('keeps keys present on only one side', () => {
    const result = mergeMemorySnapshots(
      snapshot({ customKeyValues: { localKey: '1' } }),
      snapshot({ customKeyValues: { remoteKey: '2' } }),
    );
    expect(result.merged.customKeyValues).toEqual({ localKey: '1', remoteKey: '2' });
  });

  it('prefers the newer writer when both key timestamps are known', () => {
    const result = mergeMemorySnapshots(
      snapshot({ customKeyValues: { k: 'local' }, keyTimestamps: { k: '2026-02-01T00:00:00Z' } }),
      snapshot({ customKeyValues: { k: 'remote' }, keyTimestamps: { k: '2026-01-01T00:00:00Z' } }),
    );
    expect(result.merged.customKeyValues.k).toBe('local');
    expect(result.conflicts[0].resolution).toBe('kept_local');
  });

  it('flags a key conflict it cannot resolve rather than guessing', () => {
    const result = mergeMemorySnapshots(
      snapshot({ customKeyValues: { k: 'local' } }),
      snapshot({ customKeyValues: { k: 'remote' } }),
    );
    expect(result.conflicts[0].resolution).toBe('flagged');
    expect(result.requiresAttention).toBe(true);
  });

  it('flags a name conflict but keeps a one-sided name', () => {
    expect(
      mergeMemorySnapshots(snapshot({ name: 'A' }), snapshot({ name: 'B' })).requiresAttention,
    ).toBe(true);

    const oneSided = mergeMemorySnapshots(snapshot({ name: 'Local' }), snapshot({ name: '' }));
    expect(oneSided.merged.name).toBe('Local');
    expect(oneSided.requiresAttention).toBe(false);
  });
});