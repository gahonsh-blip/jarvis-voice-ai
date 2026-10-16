// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `saveCachedLocation` returned `void` and swallowed the storage error in an
// empty catch, so a refused write (quota exceeded, private mode, or no browser
// window) was indistinguishable from a durable one. The modal and dashboard
// would then present the position as cached even though the next load reverts
// to the previous entry — or to no fix at all. The writer now reports the real
// durability of the write, and both surfaces name a refusal instead of
// advertising a cache that does not exist.
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { saveCachedLocation, loadCachedLocation } from '../utils/locationService';

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
    this.store.delete(key);
  }
}

const store = new ControllableStorage();

const COORDS = { latitude: 51.5074, longitude: -0.1278, accuracy: 12, timestamp: 1 } as const;

beforeEach(() => {
  store.clear();
  store.failWrites = false;
  store.silentWrites = false;
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveCachedLocation reports whether the fix is actually cached', () => {
  it('returns true and reads the fix back when storage accepts the write', () => {
    expect(saveCachedLocation({ ...COORDS }, null)).toBe(true);
    const loaded = loadCachedLocation();
    expect(loaded?.coords.latitude).toBeCloseTo(COORDS.latitude, 6);
  });

  it('returns false when localStorage refuses the write', () => {
    store.failWrites = true;
    expect(saveCachedLocation({ ...COORDS }, null)).toBe(false);
    expect(loadCachedLocation()).toBeNull();
  });

  it('returns false on a silent no-op write that throws nothing', () => {
    store.silentWrites = true;
    expect(saveCachedLocation({ ...COORDS }, null)).toBe(false);
  });

  it('returns false when there is no browser window', () => {
    vi.stubGlobal('window', undefined);
    expect(saveCachedLocation({ ...COORDS }, null)).toBe(false);
  });
});

const COMPONENT_DIR = path.resolve(__dirname, '../components');
const readComponent = (file: string) => fs.readFileSync(path.join(COMPONENT_DIR, file), 'utf8');
const readApp = () => fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');

describe('location surfaces never present an unpersisted fix as cached', () => {
  it('the modal surfaces a refused cache write instead of staying silent', () => {
    const src = readComponent('LocationServicesModal.tsx');
    // Every cache write in the modal must capture the real verdict...
    expect(src).not.toMatch(/(?<![!])saveCachedLocation\(/);
    expect(src).toContain('setCacheRefused(!saveCachedLocation(');
    // ...and the refusal must be rendered, not merely stored.
    expect(src).toContain('FIX NOT CACHED');
    expect(src).toContain('cacheWriteRefused');
  });

  it('the dashboard records the verdict and hands it to the location modal', () => {
    const app = readApp();
    expect(app).toContain('setLocationCacheRefused(!saveCachedLocation(');
    expect(app).toContain('cacheWriteRefused={locationCacheRefused}');
  });
});
