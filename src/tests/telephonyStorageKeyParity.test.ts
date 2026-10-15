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
    contactName: 'Parity Check',
    phoneNumber: '+10000000000',
    startTime: '2026-10-16T00:00:00.000Z',
    status: 'completed',
  } as CallRecord;
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
