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