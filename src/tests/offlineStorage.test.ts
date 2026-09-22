import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The storage helpers touch localStorage, which does not exist under Node.
// A small in-memory stand-in lets the real functions run unmodified.
class MemoryStorage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

const store = new MemoryStorage();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Imported lazily so the stubbed globals are in place first.
async function loadModule() {
  return import('../utils/offlineStorage');
}

describe('loadLocalMemory', () => {
  it('returns the seed memory when nothing is stored', async () => {
    const { loadLocalMemory, defaultInitialMemory } = await loadModule();
    expect(loadLocalMemory()).toEqual(defaultInitialMemory);
  });

  it('does not resurrect custom keys the user deleted', async () => {
    const { loadLocalMemory, saveLocalMemory } = await loadModule();

    saveLocalMemory({ notes: [], customKeyValues: {}, stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '' } } as any);
    const loaded = loadLocalMemory();

    expect(loaded.customKeyValues).toEqual({});
  });

  it('preserves an intentionally emptied note list', async () => {
    const { loadLocalMemory, saveLocalMemory } = await loadModule();

    saveLocalMemory({ notes: [], customKeyValues: { a: '1' }, stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '' } } as any);

    expect(loadLocalMemory().notes).toEqual([]);
    expect(loadLocalMemory().customKeyValues).toEqual({ a: '1' });
  });

  it('falls back to seed data when the stored document is corrupt', async () => {
    const { loadLocalMemory, defaultInitialMemory } = await loadModule();
    store.setItem('hermes_jarvis_memory_store_v1', 'not json{');
    expect(loadLocalMemory()).toEqual(defaultInitialMemory);
  });
});

// Regression guard: the first-launch chat history seed narrated a cloud sync
// that no code performs. `defaultInitialMessages` is what App.tsx renders when
// localStorage holds no transcript, so on a fresh install the operator read
// "synced with Oracle Cloud Always Free ARM node" — a claim nothing observes.
// The project's own notes state the process runs in this container, not the
// Oracle ARM VM, and no sync route exists in this build.
describe('first-launch chat seed makes no unobserved cloud claim', () => {
  it('says cloud sync is not configured rather than claiming it happened', async () => {
    const { defaultInitialMessages } = await loadModule();
    const systemMessage = defaultInitialMessages.find((m) => m.role === 'system');
    expect(systemMessage).toBeDefined();
    expect(systemMessage!.content).toContain('Cloud sync is NOT configured');
  });

  it('never asserts a completed sync or a specific cloud node', async () => {
    const { defaultInitialMessages } = await loadModule();
    const joined = defaultInitialMessages.map((m) => m.content).join('\n');
    expect(joined).not.toMatch(/synced with/i);
    expect(joined).not.toMatch(/Oracle Cloud/i);
    expect(joined).not.toMatch(/ARM node/i);
  });

  it('source of the seed no longer contains the fabricated sync string', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'utils', 'offlineStorage.ts'), 'utf8');
    expect(source).not.toContain('synced with Oracle Cloud Always Free ARM node');
  });
});