// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `saveLocalCallHistory`, `saveLocalTelephonySettings` and `saveLocalContacts`
// (`src/utils/telephonyEngine.ts`) each ran `localStorage.setItem(...)` and then
// returned `true` whenever the call did not throw. A store that accepts the call
// without throwing yet keeps the previous bytes (private browsing, a frozen or
// quota-clamped store) therefore read as a durable save: the Telephony Hub
// header badge showed `CALL STORE SYNCED` and the call log / settings / contacts
// panels rendered the new values while the store still held the old ones, and
// the next reload silently restored them.
//
// The writers now read the bytes back and return `true` only when the store
// holds exactly what was written. The existing throwing-store and no-`window`
// cases are covered by the sibling durability suites; these cases pin the
// silent-no-op class that a bare `setItem` cannot see.
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  saveLocalCallHistory,
  saveLocalTelephonySettings,
  saveLocalContacts,
  loadLocalCallHistory,
  loadLocalTelephonySettings,
  loadLocalContacts,
} from '../utils/telephonyEngine';
import { DEFAULT_TELEPHONY_SETTINGS, DEFAULT_CONTACTS } from '../types/telephony';
import type { CallRecord } from '../types/telephony';

/** A store that accepts every write without throwing but drops the bytes. */
class SilentDropStorage {
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
  setItem(_key: string, _value: string) {
    // accepted, silently dropped
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

const store = new SilentDropStorage();

beforeEach(() => {
  store.clear();
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeRecord(id: string): CallRecord {
  return {
    id,
    direction: 'outbound',
    callerNumber: '',
    callerName: '',
    recipientNumber: '+10000000000',
    recipientName: 'Silent Drop',
    startTime: '2026-10-18T00:00:00.000Z',
    durationSeconds: 0,
    status: 'ended',
    mode: 'ai_autonomous',
    transcript: [],
    summary: '',
    sentiment: 'neutral',
    intent: '',
    followUpActions: [],
  };
}

describe('a silent no-op store is not reported as a durable telephony write', () => {
  it('saveLocalCallHistory reports false and the store still holds nothing', () => {
    expect(saveLocalCallHistory([makeRecord('call-silent-1')])).toBe(false);
    expect(store.getItem('hermes_jarvis_telephony_calls_v1')).toBeNull();
    expect(loadLocalCallHistory()).toEqual([]);
  });

  it('saveLocalTelephonySettings reports false and the store still holds nothing', () => {
    expect(saveLocalTelephonySettings({ ...DEFAULT_TELEPHONY_SETTINGS, aiReceptionistGreeting: 'dropped' })).toBe(false);
    expect(store.getItem('hermes_jarvis_telephony_settings_v1')).toBeNull();
  });

  it('saveLocalContacts reports false and the store still holds nothing', () => {
    expect(saveLocalContacts(DEFAULT_CONTACTS)).toBe(false);
    expect(store.getItem('hermes_jarvis_telephony_contacts_v1')).toBeNull();
    expect(loadLocalContacts()).toEqual(DEFAULT_CONTACTS);
  });

  it('reports the write as landed only once the bytes read back', () => {
    // Same writer, a store that keeps what it is given: the read-back must
    // still pass, so the guard rejects only the dropped write.
    const keeping = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (keeping.has(k) ? keeping.get(k)! : null),
      setItem: (k: string, v: string) => void keeping.set(k, v),
      removeItem: (k: string) => void keeping.delete(k),
    });
    expect(saveLocalTelephonySettings(DEFAULT_TELEPHONY_SETTINGS)).toBe(true);
    expect(keeping.get('hermes_jarvis_telephony_settings_v1')).toBe(
      JSON.stringify(DEFAULT_TELEPHONY_SETTINGS)
    );
  });
});
