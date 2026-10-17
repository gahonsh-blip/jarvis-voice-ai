// HERMES JARVIS — Permission Gateway mobile-category echo honesty (backlog item 13).
//
// `PermissionGateway.tsx` renders the "Mobile Data Category Permissions" rows
// (battery, weather, notifications, calendar, email, device health) from React
// state `mobilePerms`. The toggle handler persisted correctly and warned when the
// store refused the write, but the row it painted came from the *requested*
// matrix: `setMobilePerms(updated)` ran before the store echo was read, and the
// success message named `updated[def.category]`.
//
// `saveMobilePermissions()` returns `false` on a refused write (quota, private
// mode, no `window`) and leaves the previous matrix in `localStorage`. So a
// refused toggle lit the row for the requested value and announced it as the new
// permission, while the next reload restored the old policy — a fake success the
// operator would trust. The sibling `MobilePersonalStatusModal` and
// `AndroidPermissionCenter` already render the durable echo; these guards require
// this modal to do the same.

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadMobilePermissions,
  saveMobilePermissions,
  DEFAULT_MOBILE_PERMISSIONS,
} from '../utils/mobileStatusEngine';

const SOURCE_PATH = path.resolve(__dirname, '../components/PermissionGateway.tsx');
const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

function categoryToggleHandlerBody(): string {
  const marker = source.indexOf('saveMobilePermissions(updated)');
  expect(marker, 'the mobile-category toggle handler was not found').toBeGreaterThanOrEqual(0);
  const start = source.lastIndexOf('onClick={() => {', marker);
  expect(start, 'the toggle handler is no longer an inline onClick').toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n                        }}', marker);
  expect(end, 'the toggle handler close could not be located').toBeGreaterThan(marker);
  return source.slice(start, end);
}

describe('PermissionGateway renders the persisted mobile-permission echo, never the request', () => {
  it('re-reads local storage after a per-category toggle instead of painting the request', () => {
    const body = categoryToggleHandlerBody();
    expect(body).toContain('saveMobilePermissions(updated)');
    expect(body).toContain('loadMobilePermissions()');
    expect(body).toContain('setMobilePerms(effective)');
    expect(body).not.toMatch(/setMobilePerms\(updated\)/);
  });

  it('announces the stored permission, not the requested one', () => {
    const body = categoryToggleHandlerBody();
    expect(body).toContain('effective[def.category]');
    expect(body).not.toMatch(/updated\[def\.category\]/);
  });

  it('names the stored value in the refusal notice and says the change reverts', () => {
    const body = categoryToggleHandlerBody();
    expect(body).toMatch(/NOT SAVED/);
    expect(body).toMatch(/reverts? on reload/);
    expect(body).toMatch(/the store still holds/);
  });

  it('never sets the mobile permission matrix from the requested value anywhere in the file', () => {
    expect(source).not.toMatch(/setMobilePerms\(updated\)/);
  });
});

describe('the store echo the gateway relies on really reports a refused write', () => {
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
      JSON.stringify({ ...DEFAULT_MOBILE_PERMISSIONS, CALENDAR_EVENTS: false })
    );
    (globalThis as any).window = {};
    (globalThis as any).localStorage = {
      getItem: (k: string) => backing.get(k) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };

    const persisted = saveMobilePermissions({ ...DEFAULT_MOBILE_PERMISSIONS, CALENDAR_EVENTS: true });
    expect(persisted).toBe(false);
    // The store still holds the pre-write value — exactly why the row must be
    // painted from `loadMobilePermissions()` and not from the request.
    expect(loadMobilePermissions().CALENDAR_EVENTS).toBe(false);
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

    expect(saveMobilePermissions({ ...DEFAULT_MOBILE_PERMISSIONS, CALENDAR_EVENTS: true })).toBe(true);
    expect(loadMobilePermissions().CALENDAR_EVENTS).toBe(true);
  });
});
