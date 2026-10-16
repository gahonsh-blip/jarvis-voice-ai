import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mergeMemorySnapshots, type MemorySnapshot } from '../utils/memory/memoryConflict';
import { classifyMemorySync } from '../utils/hardening/memorySyncTruth';

// Regression guard for backlog item 13. `POST /api/memory/sync` wrote the
// client-supplied name into the authoritative memory even when the merge had
// flagged it as a conflict, and returned it in `merged` — so the response read
// as a completed merge while the server copy was silently overwritten. The
// decision logic is exercised against the real merge helper, and the route
// wiring is asserted against the source text (server.ts binds a port on import).
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

const empty: MemorySnapshot = { name: '', notes: [], customKeyValues: {} };

describe('classifyMemorySync never applies a conflicting name', () => {
  it('keeps the server name and reports NAME_CONFLICT when both sides differ', () => {
    const local: MemorySnapshot = { ...empty, name: 'Local User' };
    const remote: MemorySnapshot = { ...empty, name: 'Server Owner' };
    const result = mergeMemorySnapshots(local, remote);

    const verdict = classifyMemorySync(result, remote);

    expect(verdict.outcome).toBe('NAME_CONFLICT');
    expect(verdict.nameApplied).toBe(false);
    expect(verdict.requiresAttention).toBe(true);
    // Nothing else changed, so nothing was stored — the route must not claim it was.
    expect(verdict.stored).toBe(false);
    expect(verdict.message).toContain('not applied');
  });

  it('still reports a name conflict when notes also arrived', () => {
    const local: MemorySnapshot = {
      name: 'Local User',
      notes: [{ id: 'n1', title: 'Offline', content: 'x', createdAt: '2026-01-01T00:00:00Z' }],
      customKeyValues: {},
    };
    const remote: MemorySnapshot = { ...empty, name: 'Server Owner' };
    const result = mergeMemorySnapshots(local, remote);

    const verdict = classifyMemorySync(result, remote);

    expect(verdict.outcome).toBe('NAME_CONFLICT');
    expect(verdict.nameApplied).toBe(false);
    // The new note is still stored; only the name is withheld.
    expect(verdict.stored).toBe(true);
  });

  it('applies the local name when the server has none', () => {
    const local: MemorySnapshot = { ...empty, name: 'Local User' };
    const remote: MemorySnapshot = { ...empty, name: '' };
    const result = mergeMemorySnapshots(local, remote);

    const verdict = classifyMemorySync(result, remote);

    expect(verdict.outcome).toBe('APPLIED');
    expect(verdict.nameApplied).toBe(true);
    expect(verdict.stored).toBe(true);
  });
});

describe('classifyMemorySync reports an unchanged sync honestly', () => {
  it('reports NOTHING_TO_APPLY when the snapshots match', () => {
    const snapshot: MemorySnapshot = {
      name: '',
      notes: [{ id: 'n1', title: 'Same', content: 'y', createdAt: '2026-01-01T00:00:00Z' }],
      customKeyValues: { protocol: 'Hermes' },
    };
    const result = mergeMemorySnapshots(snapshot, snapshot);

    const verdict = classifyMemorySync(result, snapshot);

    expect(verdict.outcome).toBe('NOTHING_TO_APPLY');
    expect(verdict.stored).toBe(false);
    expect(verdict.nameApplied).toBe(false);
  });

  it('reports APPLIED when only a new note arrived', () => {
    const local: MemorySnapshot = {
      name: '',
      notes: [{ id: 'new', title: 'New', content: 'z', createdAt: '2026-01-01T00:00:00Z' }],
      customKeyValues: {},
    };
    const remote: MemorySnapshot = { ...empty };
    const result = mergeMemorySnapshots(local, remote);

    const verdict = classifyMemorySync(result, remote);

    expect(verdict.outcome).toBe('APPLIED');
    expect(verdict.stored).toBe(true);
    expect(verdict.nameApplied).toBe(false);
  });

  it('reports APPLIED when only a new key-value arrived', () => {
    const local: MemorySnapshot = { ...empty, customKeyValues: { city: 'Pune' } };
    const remote: MemorySnapshot = { ...empty, customKeyValues: { protocol: 'Hermes' } };
    const result = mergeMemorySnapshots(local, remote);

    const verdict = classifyMemorySync(result, remote);

    expect(verdict.outcome).toBe('APPLIED');
    expect(verdict.stored).toBe(true);
  });
});

describe('the memory/sync route no longer overwrites the name on conflict', () => {
  const route = (() => {
    const start = serverSource.indexOf("app.post('/api/memory/sync'");
    return serverSource.slice(start, serverSource.indexOf('// =====', start));
  })();

  it('classifies the merge before writing memory', () => {
    expect(route).toContain('classifyMemorySync(');
    expect(route).toMatch(/if \(verdict\.nameApplied\)/);
  });

  it('no longer writes the merged name unconditionally', () => {
    expect(route).not.toContain('if (result.merged.name !== undefined) memoryState.name');
  });

  it('reports the stored/outcome fields so a no-op is not read as a merge', () => {
    expect(route).toContain('stored: verdict.stored');
    expect(route).toContain('outcome: verdict.outcome');
  });
});
