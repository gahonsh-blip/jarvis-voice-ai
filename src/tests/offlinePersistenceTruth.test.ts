import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A localStorage stand-in whose writes can be made to fail, so the "did the
// write actually land?" contract of the offline writers can be exercised.
class ControllableStorage {
  private store = new Map<string, string>();
  failWrites = false;
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
    this.store.delete(key);
  }
}

const store = new ControllableStorage();

beforeEach(() => {
  store.clear();
  store.failWrites = false;
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
