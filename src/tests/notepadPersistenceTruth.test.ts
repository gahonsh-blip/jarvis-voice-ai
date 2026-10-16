import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Zero-fake-success guard for the JARVIS Notepad save button.
//
// `handleSave` wrote the draft with a bare `localStorage.setItem` and then set
// `savedStatus` to true, so the button always read "Saved!" — even when storage
// refused the write (quota exceeded, private mode, storage disabled). The draft
// was then lost on reload while the UI had confirmed a durable save. The writer
// now reports the real result and the component renders an explicit NOT SAVED
// state instead of a false confirmation.

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

describe('notepad writer reports whether the write landed', () => {
  it('returns true and stores the draft when the write is accepted', async () => {
    const { saveLocalNotepadContent, loadLocalNotepadContent } = await loadModule();

    expect(saveLocalNotepadContent('hello jarvis')).toBe(true);
    expect(loadLocalNotepadContent()).toBe('hello jarvis');
  });

  it('returns false when localStorage refuses the write', async () => {
    const { saveLocalNotepadContent, loadLocalNotepadContent } = await loadModule();

    store.failWrites = true;
    expect(saveLocalNotepadContent('hello jarvis')).toBe(false);
    // Nothing landed, so the next reload finds no draft.
    expect(loadLocalNotepadContent()).toBeNull();
  });

  it('returns false and reads null when there is no browser window (SSR / Node)', async () => {
    const { saveLocalNotepadContent, loadLocalNotepadContent } = await loadModule();
    vi.stubGlobal('window', undefined);
    expect(saveLocalNotepadContent('hello jarvis')).toBe(false);
    expect(loadLocalNotepadContent()).toBeNull();
  });
});

describe('NotepadModal never shows a false "Saved!" confirmation', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../components/NotepadModal.tsx'), 'utf8');

  it('routes the save through the truth-reporting writer, not a bare setItem', () => {
    expect(src).toContain('saveLocalNotepadContent');
    expect(src).not.toMatch(/localStorage\.setItem\(\s*'jarvis_notepad_content'/);
  });

  it('gates the "Saved!" state on the real write result', () => {
    // The success branch must be reached only through the `saved` verdict.
    expect(src).toMatch(/if\s*\(\s*saved\s*\)/);
    expect(src).toContain('setSavedStatus(true)');
    expect(src).toContain('setSaveError(');
  });

  it('surfaces an explicit NOT SAVED notice when the write fails', () => {
    expect(src).toContain('NOT SAVED');
    expect(src).toContain('saveError');
  });
});
