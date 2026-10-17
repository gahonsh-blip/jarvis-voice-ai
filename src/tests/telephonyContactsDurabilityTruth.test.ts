// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `saveLocalContacts` returned `void` and swallowed the storage error in an
// empty catch, so a refused write (quota exceeded, private mode, or no
// `localStorage` at all) was indistinguishable from a durable one — the same
// gap already closed for `saveLocalCallHistory` and `saveLocalTelephonySettings`.
// The writer now reports whether the write actually landed so a caller can name
// a persistence gap instead of announcing a save the next reload would not find.
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveLocalContacts, loadLocalContacts } from '../utils/telephonyEngine';
import { DEFAULT_CONTACTS } from '../types/telephony';

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

describe('saveLocalContacts reports whether the write landed', () => {
  it('returns true and reads back the contacts when storage accepts the write', () => {
    const contacts = [{ ...DEFAULT_CONTACTS[0], isSample: false }];
    expect(saveLocalContacts(contacts)).toBe(true);
    const loaded = loadLocalContacts();
    expect(loaded.map((c) => c.number)).toEqual(contacts.map((c) => c.number));
  });

  it('returns false when localStorage refuses the write', () => {
    store.failWrites = true;
    expect(saveLocalContacts(DEFAULT_CONTACTS)).toBe(false);
  });

  it('returns false when there is no window (server render)', () => {
    vi.stubGlobal('window', undefined);
    expect(saveLocalContacts(DEFAULT_CONTACTS)).toBe(false);
  });
});
