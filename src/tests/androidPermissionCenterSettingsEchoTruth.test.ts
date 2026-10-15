// HERMES JARVIS — Android Permission Center policy-write honesty (backlog item 13).
//
// `AndroidPermissionCenter.tsx` renders the per-category notification policy
// (section 2) and the per-application allow/block rules (section 3). Both
// handlers persisted correctly and warned when the store refused the write, but
// the rows were still rendered from the *requested* object:
//
//   const next = { ...categories, [cat]: !categories[cat] };
//   setCategories(next);                                  // renders the request
//   const persisted = androidBridgeEngine.updateSettings({ categoryPermissions: next });
//
// `AndroidBridgeManager.updateSettings()` snapshots the previous settings,
// applies the change, calls `saveState()` and — when a durable store refused the
// write (`saveState()` false while `hasStorage()` is true) — **reverts** its
// in-memory settings to the snapshot and returns false. So the row was painted
// from the request while the store still held the old policy, and the next
// reload silently restored it: a fake success the operator would trust.
//
// These guards require both handlers to derive the rendered rows from the
// durable store echo (`androidBridgeEngine.getSettings()`) and never from the
// request. They read the component source, so they fail if the state-only
// mutation returns.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AndroidBridgeManager } from '../utils/androidBridgeEngine';
import type { AndroidBridgeSettings } from '../types/mobileBridge';

const SOURCE_PATH = path.resolve(__dirname, '../components/AndroidPermissionCenter.tsx');
const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

function handlerBody(name: string): string {
  const start = source.indexOf(`const ${name} = `);
  expect(start, `${name} not found`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  const nextConst = rest.indexOf('\n  const ', 1);
  const end = nextConst >= 0 ? nextConst : rest.length;
  return rest.slice(0, end);
}

describe('AndroidPermissionCenter renders the persisted policy echo, never the request', () => {
  it('re-reads the bridge store after a category toggle', () => {
    const body = handlerBody('handleToggleCategory');
    expect(body).toContain('androidBridgeEngine.updateSettings(');
    expect(body).toContain('androidBridgeEngine.getSettings().categoryPermissions');
    expect(body).toContain('setCategories(stored)');
    // The rendered rows must not be driven by the requested object.
    expect(body).not.toMatch(/setCategories\(next\)/);
  });

  it('re-reads the bridge store after a per-app rule toggle', () => {
    const body = handlerBody('handleToggleAppRule');
    expect(body).toContain('androidBridgeEngine.updateSettings(');
    expect(body).toContain('androidBridgeEngine.getSettings().privacyRules');
    expect(body).toContain('setAppRules(stored)');
    expect(body).not.toMatch(/setAppRules\(next\)/);
  });

  it('names the stored value, not the requested one, when the write is refused', () => {
    for (const name of ['handleToggleCategory', 'handleToggleAppRule']) {
      const body = handlerBody(name);
      expect(body, `${name} must warn with the stored value`).toMatch(/is still \$\{/);
    }
  });
});

// Behavioural proof of the store-echo contract the component relies on: a
// refused write must return false AND leave the previous policy in the store, so
// `getSettings()` is authoritative.
describe('AndroidBridgeManager.updateSettings reverts on a refused write', () => {
  const originalLocalStorage = (globalThis as any).localStorage;
  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    (globalThis as any).window = {};
  });

  afterEach(() => {
    (globalThis as any).localStorage = originalLocalStorage;
    (globalThis as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  it('returns false and keeps the previous category policy when the store refuses', () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    const engine = new AndroidBridgeManager();
    const before = engine.getSettings().categoryPermissions;

    (globalThis as any).localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const refused = engine.updateSettings({ categoryPermissions: { ...before, OTHER_APPS: !before.OTHER_APPS } });

    expect(refused).toBe(false);
    // The echo the component now renders must equal the pre-write policy.
    expect(engine.getSettings().categoryPermissions).toEqual(before);
  });

  it('returns true and exposes the new policy when the store accepts', () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    const engine = new AndroidBridgeManager();
    const before = engine.getSettings().categoryPermissions;
    const requested = { ...before, OTHER_APPS: !before.OTHER_APPS };

    expect(engine.updateSettings({ categoryPermissions: requested })).toBe(true);
    expect(engine.getSettings().categoryPermissions).toEqual(requested);
  });

  it('keeps the previous privacy rules when the store refuses', () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    const engine = new AndroidBridgeManager();
    const before: AndroidBridgeSettings['privacyRules'] = engine.getSettings().privacyRules;
    const pkg = Object.keys(before)[0];
    expect(pkg, 'engine must ship at least one default app rule').toBeTruthy();

    (globalThis as any).localStorage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const refused = engine.updateSettings({
      privacyRules: { ...before, [pkg]: { ...before[pkg], allowed: !before[pkg].allowed } },
    });

    expect(refused).toBe(false);
    expect(engine.getSettings().privacyRules).toEqual(before);
  });
});
