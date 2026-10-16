// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `saveBridgeRegistration` / `clearBridgeRegistration` (mobileBridgeEngine.ts)
// returned `void` and swallowed the storage error in an empty catch, so a
// refused write (quota exceeded, private mode, or no browser window) was
// indistinguishable from a durable one. The mobile bridge UI would then report
// the handset as registered while `loadBridgeRegistration()` returned nothing on
// the next load. Both writers now return the real durability verdict.
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  saveBridgeRegistration,
  clearBridgeRegistration,
  loadBridgeRegistration,
  type BridgeRegistration,
} from '../utils/mobileBridgeEngine';

class ControllableStorage {
  private store = new Map<string, string>();
  failWrites = false;
  silentWrites = false;
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
    // A refused write that does not throw: the browser accepted the call but
    // dropped the bytes. Only a read-back can tell the difference.
    if (this.silentWrites) return;
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    if (this.failWrites) throw new DOMException('QuotaExceededError');
    this.store.delete(key);
  }
}

const store = new ControllableStorage();

const REG: BridgeRegistration = {
  deviceId: 'device-1',
  deviceName: 'Pixel 8',
  platform: 'android',
  appVersion: '1.0.0',
  connectedAt: new Date(1).toISOString(),
  lastSeenAt: new Date(1).toISOString(),
  live: true,
  capabilities: {
    notificationListenerGranted: true,
    canAnswerCalls: false,
  },
} as unknown as BridgeRegistration;

beforeEach(() => {
  store.clear();
  store.failWrites = false;
  store.silentWrites = false;
  (globalThis as any).localStorage = store;
  (globalThis as any).window = globalThis;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('bridge registration durability truth (item 13)', () => {
  it('reports an accepted write as durable and reads it back', () => {
    expect(saveBridgeRegistration(REG)).toBe(true);
    expect(loadBridgeRegistration()).not.toBeNull();
  });

  it('reports a thrown refusal as not saved and leaves the store empty', () => {
    store.failWrites = true;
    expect(saveBridgeRegistration(REG)).toBe(false);
    store.failWrites = false;
    expect(loadBridgeRegistration()).toBeNull();
  });

  it('reports a silent no-op write as not saved', () => {
    store.silentWrites = true;
    expect(saveBridgeRegistration(REG)).toBe(false);
    store.silentWrites = false;
    expect(loadBridgeRegistration()).toBeNull();
  });

  it('reports a refused clear as not cleared and keeps the registration', () => {
    expect(saveBridgeRegistration(REG)).toBe(true);
    store.failWrites = true;
    expect(clearBridgeRegistration()).toBe(false);
    store.failWrites = false;
    expect(loadBridgeRegistration()).not.toBeNull();
  });

  it('reports an accepted clear as cleared', () => {
    expect(saveBridgeRegistration(REG)).toBe(true);
    expect(clearBridgeRegistration()).toBe(true);
    expect(loadBridgeRegistration()).toBeNull();
  });

  it('reports not saved with no browser window', () => {
    const originalWindow = (globalThis as any).window;
    delete (globalThis as any).window;
    try {
      expect(saveBridgeRegistration(REG)).toBe(false);
      expect(clearBridgeRegistration()).toBe(false);
    } finally {
      (globalThis as any).window = originalWindow;
    }
  });

  it('source guard: no pre-fix void writer remains', () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, '../utils/mobileBridgeEngine.ts'),
      'utf8'
    );
    expect(src).not.toMatch(/export function saveBridgeRegistration\([^)]*\): void/);
    expect(src).not.toMatch(/export function clearBridgeRegistration\([^)]*\): void/);
  });
});
