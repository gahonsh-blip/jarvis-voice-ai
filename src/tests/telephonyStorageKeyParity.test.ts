import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  loadLocalCallHistory,
  loadLocalTelephonySettings,
  saveLocalCallHistory,
  saveLocalTelephonySettings,
} from '../utils/telephonyEngine';
import { DEFAULT_TELEPHONY_SETTINGS } from '../types/telephony';
import type { CallRecord } from '../types/telephony';
import {
  telephonyPersistenceBadge,
  telephonyPersistenceBadgeTitle,
  telephonyPersistenceTone,
} from '../utils/hardening/telephonyPersistenceBadgeTruth';

const APP_SOURCE = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf-8');

// The App used to persist telephony state under `hermes_jarvis_call_history` /
// `hermes_jarvis_telephony_settings`, while the shared telephony engine defines
// and reads `..._v1` keys. The App was self-consistent, so the divergence was
// invisible: every engine consumer read a store that was never written. These
// tests pin the two together.
const ENGINE_KEYS = {
  calls: 'hermes_jarvis_telephony_calls_v1',
  settings: 'hermes_jarvis_telephony_settings_v1',
} as const;

const STALE_LITERALS = ['hermes_jarvis_call_history', 'hermes_jarvis_telephony_settings'] as const;

function makeRecord(): CallRecord {
  return {
    id: 'call-parity-1',
    direction: 'outbound',
    callerNumber: '',
    callerName: '',
    recipientNumber: '+10000000000',
    recipientName: 'Parity Check',
    startTime: '2026-10-16T00:00:00.000Z',
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

describe('Telephony storage key parity — App and engine share one store', () => {
  it('App does not persist telephony state under the stale non-`_v1` keys', () => {
    for (const literal of STALE_LITERALS) {
      expect(APP_SOURCE).not.toContain(`'${literal}'`);
    }
  });

  it('App routes call history and settings through the engine helpers', () => {
    for (const helper of [
      'loadLocalCallHistory',
      'saveLocalCallHistory',
      'loadLocalTelephonySettings',
      'saveLocalTelephonySettings',
    ]) {
      expect(APP_SOURCE).toContain(helper);
    }
  });
});

describe('Telephony storage key parity — engine round-trip', () => {
  const store = new Map<string, string>();
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    store.clear();
    (globalThis as { window?: unknown }).window = globalThis;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('saveLocalCallHistory writes the engine key the loaders read', () => {
    saveLocalCallHistory([makeRecord()]);
    expect(store.has(ENGINE_KEYS.calls)).toBe(true);
    expect(loadLocalCallHistory()).toHaveLength(1);
    expect(loadLocalCallHistory()[0].id).toBe('call-parity-1');


  });

  it('saveLocalTelephonySettings writes the engine key the loaders read', () => {
    saveLocalTelephonySettings({ ...DEFAULT_TELEPHONY_SETTINGS, spamThresholdScore: 91 });
    expect(store.has(ENGINE_KEYS.settings)).toBe(true);
    expect(loadLocalTelephonySettings().spamThresholdScore).toBe(91);
  });

  it('is a no-op without a window (server render) instead of throwing', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(() => saveLocalCallHistory([makeRecord()])).not.toThrow();
    expect(loadLocalCallHistory()).toEqual([]);
  });
});

const HUB_SOURCE = readFileSync(resolve(process.cwd(), 'src/components/TelephonyHubModal.tsx'), 'utf-8');

// Item 13 (Zero-fake-success). The telephony writers returned `void` and
// swallowed the storage error, so a refused write (quota, private mode, no
// `localStorage`) was indistinguishable from a durable one: the operator read a
// populated Call Logs tab that the next reload would silently drop. The writers
// now report the real result and the Hub header badge branches on it.
describe('Telephony writers report whether the write landed', () => {
  const store = new Map<string, string>();
  let failWrites = false;
  const originalWindow = (globalThis as { window?: unknown }).window;

  beforeEach(() => {
    store.clear();
    failWrites = false;
    (globalThis as { window?: unknown }).window = globalThis;
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        if (failWrites) throw new DOMException('QuotaExceededError');
        store.set(k, v);
      },
      removeItem: (k: string) => void store.delete(k),
    };
  });

  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it('returns true when the write is accepted', () => {
    expect(saveLocalCallHistory([makeRecord()])).toBe(true);
    expect(saveLocalTelephonySettings(DEFAULT_TELEPHONY_SETTINGS)).toBe(true);
  });

  it('returns false when localStorage refuses the write', () => {
    failWrites = true;
    expect(saveLocalCallHistory([makeRecord()])).toBe(false);
    expect(saveLocalTelephonySettings(DEFAULT_TELEPHONY_SETTINGS)).toBe(false);
  });

  it('returns false when there is no browser window (SSR / Node)', () => {
    delete (globalThis as { window?: unknown }).window;
    expect(saveLocalCallHistory([makeRecord()])).toBe(false);
    expect(saveLocalTelephonySettings(DEFAULT_TELEPHONY_SETTINGS)).toBe(false);
  });
});

describe('Telephony Hub persistence badge states only the observed verdict', () => {
  it('reads synced only for an observed accepted write', () => {
    expect(telephonyPersistenceBadge(true)).toBe('CALL STORE SYNCED');
    expect(telephonyPersistenceTone(true)).toBe('ok');
  });

  it('names the revert for a refused write', () => {
    expect(telephonyPersistenceBadge(false)).toContain('NOT SAVED');
    expect(telephonyPersistenceTone(false)).toBe('warn');
    expect(telephonyPersistenceBadgeTitle(false)).toContain('revert on reload');
  });

  it('states unknown before any write is observed', () => {
    expect(telephonyPersistenceBadge(null)).toContain('UNKNOWN');
    expect(telephonyPersistenceTone(null)).toBe('unknown');
    expect(telephonyPersistenceTone(undefined)).toBe('unknown');
  });
});

describe('Telephony Hub surfaces the observed persistence verdict', () => {
  it('renders the badge from the observed verdict instead of a fixed claim', () => {
    expect(HUB_SOURCE).toContain('telephonyPersistenceBadge(persistenceState)');
    expect(HUB_SOURCE).toContain('telephonyPersistenceBadgeTitle(persistenceState)');
  });

  it('App captures the writers verdict and passes it to the Hub', () => {
    expect(APP_SOURCE).toContain('setTelephonyPersistenceState(');
    expect(APP_SOURCE).toContain('persistenceState={telephonyPersistenceState}');
  });
});

