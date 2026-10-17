import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A localStorage stand-in whose writes can be made to fail, so the "did the
// write actually land?" contract of the offline writers can be exercised.
class ControllableStorage {
  private store = new Map<string, string>();
  failWrites = false;
  // Private mode / a locked-down storage throws `SecurityError` on removal as
  // well as on write, so the double models that separately from `failWrites`.
  failRemoves = false;
  // A removal that reports success but leaves the key in place: the silent
  // failure a bare `removeItem` call cannot detect.
  ignoreRemoves = false;
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
    if (this.failWrites) throw new DOMException('QuotaExceededError');
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    if (this.failRemoves) throw new DOMException('SecurityError');
    // A storage that reports success without deleting is the silent-failure
    // case the post-removal read exists to catch.
    if (this.ignoreRemoves) return;
    this.store.delete(key);
  }
}

const store = new ControllableStorage();

beforeEach(() => {
  store.clear();
  store.failWrites = false;
  store.failRemoves = false;
  store.ignoreRemoves = false;
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadModule() {
  return import('../utils/offlineStorage');
}

// Item 13 (Zero-fake-success). The offline writers used to return `void` and
// swallow a storage error, while App.tsx announced "PERSISTED TO LOCAL STORAGE"
// unconditionally. On a full disk, in private mode, or when the browser refuses
// storage, the change never reached disk yet the operator read a completed save
// that the next reload would not find. The writers now report the real result
// and the status line branches on it.
describe('offline writers report whether the write landed', () => {
  it('returns true when the write is accepted', async () => {
    const { saveLocalChatHistory, saveLocalMemory, saveLocalVoiceSettings, queuePendingSync } =
      await loadModule();

    expect(saveLocalChatHistory([{ role: 'user', content: 'hi' }] as any)).toBe(true);
    expect(saveLocalMemory({ notes: [], customKeyValues: {}, stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '' } } as any)).toBe(true);
    expect(saveLocalVoiceSettings({ language: 'en' } as any)).toBe(true);
    expect(queuePendingSync('memory_sync', { a: 1 })).toBe(true);
  });

  it('returns false when localStorage refuses the write', async () => {
    const { saveLocalChatHistory, saveLocalMemory, saveLocalVoiceSettings, queuePendingSync } =
      await loadModule();

    store.failWrites = true;
    expect(saveLocalChatHistory([{ role: 'user', content: 'hi' }] as any)).toBe(false);
    expect(saveLocalMemory({ notes: [], customKeyValues: {}, stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '' } } as any)).toBe(false);
    expect(saveLocalVoiceSettings({ language: 'en' } as any)).toBe(false);
    expect(queuePendingSync('memory_sync', { a: 1 })).toBe(false);
  });

  it('returns false when there is no browser window (SSR / Node)', async () => {
    const { saveLocalMemory } = await loadModule();
    vi.stubGlobal('window', undefined);
    expect(saveLocalMemory({ notes: [], customKeyValues: {}, stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '' } } as any)).toBe(false);
  });
});

// Item 13 (Zero-fake-success). `clearPendingSyncQueue` returned `void` and
// swallowed the storage error, so App.tsx announced "MEMORY SYNCED" after a
// refused clear. The items were still on disk and the next reconnect re-posted
// them, while the operator had been told the queue was gone.
describe('clearPendingSyncQueue reports whether the queue actually emptied', () => {
  it('returns true when the key is confirmed gone', async () => {
    const { queuePendingSync, clearPendingSyncQueue, getPendingSyncQueue } = await loadModule();
    expect(queuePendingSync('memory_sync', { a: 1 })).toBe(true);
    expect(getPendingSyncQueue().length).toBe(1);
    expect(clearPendingSyncQueue()).toBe(true);
    expect(getPendingSyncQueue().length).toBe(0);
  });

  it('returns false when the removal reports success but the key survives', async () => {
    const { queuePendingSync, clearPendingSyncQueue } = await loadModule();
    queuePendingSync('memory_sync', { a: 1 });
    store.ignoreRemoves = true;
    // A bare `removeItem` would report success here; only reading the key back
    // distinguishes "emptied" from "silently not emptied".
    expect(clearPendingSyncQueue()).toBe(false);
    store.ignoreRemoves = false;
    expect(store.getItem('hermes_jarvis_pending_sync_v1')).not.toBeNull();
  });

  it('returns false when localStorage throws on removal', async () => {
    const { queuePendingSync, clearPendingSyncQueue } = await loadModule();
    queuePendingSync('memory_sync', { a: 1 });
    store.failRemoves = true;
    expect(clearPendingSyncQueue()).toBe(false);
    store.failRemoves = false;
    expect(store.getItem('hermes_jarvis_pending_sync_v1')).not.toBeNull();
  });

  it('returns false when there is no browser window (SSR / Node)', async () => {
    const { clearPendingSyncQueue } = await loadModule();
    vi.stubGlobal('window', undefined);
    expect(clearPendingSyncQueue()).toBe(false);
  });
});

// Pins the App.tsx fix so the unconditional "persisted" claim cannot silently
// return. A source scan is used because App.tsx is a large React component that
// the suite does not otherwise mount.
describe('offline status line does not claim a save it did not verify', () => {
  const fs = require('fs');
  const path = require('path');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

  it('no longer announces persistence unconditionally', () => {
    expect(appSource).not.toContain(
      "setStatusText('LOCAL OFFLINE ENGINE EXECUTED • PERSISTED TO LOCAL STORAGE')"
    );
  });

  it('branches the status line on the captured write result', () => {
    expect(appSource).toContain('localWriteLanded');
    expect(appSource).toContain('NOT SAVED LOCALLY (STORAGE UNAVAILABLE)');
  });

  it('captures the chat-history write result before reporting', () => {
    expect(appSource).toMatch(/localWriteLanded\s*=\s*saveLocalChatHistory\(/);
  });
});

// The sync flush announced "MEMORY SYNCED" while the queue-clear result was
// dropped, so a refused clear still read as a flushed queue.
describe('App.tsx sync flush observes the queue-clear result', () => {
  const fs = require('fs');
  const path = require('path');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const appFlat = appSource.replace(/\s+/g, ' ');

  it('captures the queue-clear verdict instead of discarding it', () => {
    expect(appFlat).toMatch(/const queueCleared = clearPendingSyncQueue\(\);/);
    expect([...appFlat.matchAll(/clearPendingSyncQueue\(\)/g)].length).toBe(1);
  });

  it('discloses a queue that could not be cleared', () => {
    expect(appSource).toContain('QUEUE NOT CLEARED (STORAGE UNAVAILABLE)');
    expect(appFlat).toContain('BACKEND RECONNECTED • MEMORY SYNCED${flushNotice}');
  });
});
