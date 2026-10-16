// HERMES JARVIS — Mobile Personal Status permission write honesty (backlog item 13).
//
// `MobilePersonalStatusModal.tsx` renders the Android permission badges and the
// local data-category rows from React state. Every handler persisted correctly
// and warned when the store refused the write, but the badge was still rendered
// from the *requested* matrix:
//
//   - `handleToggleAndroidBridgePerm` kept its local `current` snapshot even
//     though `androidBridgeEngine.updatePermission(...)` reverts its in-memory
//     matrix on a refused write, so the badge showed a permission the store did
//     not hold.
//   - `handleTogglePermission` / `handleGrantAll` / `handleRevokeAll` set the
//     requested matrix and never read the store back, so "Grant All" lit every
//     row green on a refused write.
//
// The sibling `MobileBridgeModal` and `AndroidPermissionCenter` already render
// the store echo. These guards require this modal to do the same: the badge must
// be derived from the persisted store, never from the requested value. They read
// the component source, so they fail if the state-only mutation returns.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { loadMobilePermissions, saveMobilePermissions } from '../utils/mobileStatusEngine';
import { DEFAULT_MOBILE_PERMISSIONS } from '../utils/mobileStatusEngine';

const SOURCE_PATH = path.resolve(__dirname, '../components/MobilePersonalStatusModal.tsx');
const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

function handlerBody(name: string): string {
  const start = source.indexOf(`const ${name} = `);
  expect(start, `${name} not found`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  const close = /\n  \};/.exec(rest);
  const nextConst = rest.indexOf('\n  const ', 1);
  const end = Math.min(
    close ? close.index + close[0].length : rest.length,
    nextConst >= 0 ? nextConst : rest.length
  );
  return rest.slice(0, end);
}

describe('MobilePersonalStatusModal renders the persisted store echo, never the request', () => {
  it('re-reads the bridge store after an Android permission toggle', () => {
    const body = handlerBody('handleToggleAndroidBridgePerm');
    expect(body).toContain('androidBridgeEngine.updatePermission(');
    // The badge source must be the engine's echo, not the local snapshot.
    expect(body).toContain('setAndroidPerms({ ...androidBridgeEngine.getPermissions() })');
    expect(body).not.toMatch(/setAndroidPerms\(current\)/);
  });

  it('re-reads local storage after a per-category permission toggle', () => {
    const body = handlerBody('handleTogglePermission');
    expect(body).toMatch(/const persisted = saveMobilePermissions\(updated\)/);
    expect(body).toContain('loadMobilePermissions()');
    expect(body).not.toMatch(/setPermissions\(updated\)/);
  });

  it('re-reads local storage after Grant All and Revoke All', () => {
    for (const name of ['handleGrantAll', 'handleRevokeAll']) {
      const body = handlerBody(name);
      expect(body, `${name} must capture the save result`).toMatch(/saveMobilePermissions\(/);
      expect(body, `${name} must read the store back`).toContain('loadMobilePermissions()');
      expect(body, `${name} must warn when the write was refused`).toMatch(/NOT SAVED/);
      expect(body, `${name} must say the change reverts on reload`).toMatch(/reverts? on reload/);
    }
  });

  it('never sets the permission matrix from the requested value alone', () => {
    expect(source).not.toMatch(/setPermissions\(updated\)/);
    expect(source).not.toMatch(/setPermissions\(allTrue\);\s*\n\s*setPermissionNotice/);
    expect(source).not.toMatch(/setPermissions\(allFalse\);\s*\n\s*setPermissionNotice/);
  });
});

describe('the store echo the modal relies on really reports a refused write', () => {
  const originalWindow = (globalThis as any).window;
  const originalStorage = (globalThis as any).localStorage;

  afterEach(() => {
    if (originalWindow === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = originalWindow;
    if (originalStorage === undefined) delete (globalThis as any).localStorage;
    else (globalThis as any).localStorage = originalStorage;
  });

  it('a refused setItem reports false and leaves the previous matrix in the store', () => {
    const backing = new Map<string, string>();
    backing.set(
      'hermes_jarvis_mobile_permissions_v1',
      JSON.stringify({ ...DEFAULT_MOBILE_PERMISSIONS, NOTIFICATIONS: false })
    );
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };

    const persisted = saveMobilePermissions({
      ...DEFAULT_MOBILE_PERMISSIONS,
      NOTIFICATIONS: true,
    });
    expect(persisted).toBe(false);
    // The store still holds the pre-write value — this is exactly why the badge
    // must come from `loadMobilePermissions()` and not from the request.
    expect(loadMobilePermissions().NOTIFICATIONS).toBe(false);
  });

  it('an accepted write is visible on read-back', () => {
    const backing = new Map<string, string>();
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: (k: string, v: string) => {
        backing.set(k, v);
      },
    };

    expect(saveMobilePermissions({ ...DEFAULT_MOBILE_PERMISSIONS, NOTIFICATIONS: true })).toBe(true);
    expect(loadMobilePermissions().NOTIFICATIONS).toBe(true);
  });
});
