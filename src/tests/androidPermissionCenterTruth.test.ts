// HERMES JARVIS — Android Permission Center settings-write honesty (backlog item 13).
//
// The per-category notification toggles (`handleToggleCategory`) and the
// per-application allow/block rules (`handleToggleAppRule`) both called
// `androidBridgeEngine.updateSettings(...)` and discarded its boolean result.
// `updateSettings` returns `false` when the bridge store refused the write
// (no `localStorage`, quota exceeded, private mode), so a refused write looked
// like a durable settings change: the toggle flipped on screen and stayed
// flipped until the next reload silently restored the old value.
//
// `updatePermission` in the same component already gates its status message on
// the persisted boolean. These guards require the two settings handlers to do
// the same — never present a settings write as saved unless the store accepted
// it. They read the component source, so they fail if the discarded-result
// pattern returns.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SOURCE_PATH = path.resolve(__dirname, '../components/AndroidPermissionCenter.tsx');
const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

function handlerBody(name: string): string {
  const start = source.indexOf(`const ${name} = `);
  expect(start, `${name} not found`).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start);
  // Bound at this handler's closing `};` or the next top-level handler,
  // whichever comes first — a fixed-width slice truncates the longer handlers.
  const close = /\n  \};/.exec(rest);
  const nextConst = rest.indexOf('\n  const ', 1);
  const end = Math.min(
    close ? close.index + close[0].length : rest.length,
    nextConst >= 0 ? nextConst : rest.length
  );
  return rest.slice(0, end);
}

describe('AndroidPermissionCenter never presents a settings write as saved without a store', () => {
  it('captures the updateSettings result for the category toggle', () => {
    const body = handlerBody('handleToggleCategory');
    expect(body).toMatch(/const persisted = androidBridgeEngine\.updateSettings\(/);
  });

  it('captures the updateSettings result for the app-rule toggle', () => {
    const body = handlerBody('handleToggleAppRule');
    expect(body).toMatch(/const persisted = androidBridgeEngine\.updateSettings\(/);
  });

  it('never discards an updateSettings result as a bare statement', () => {
    expect(source).not.toMatch(/^\s*androidBridgeEngine\.updateSettings\([^;]*\);\s*$/m);
  });

  it('gates both handlers on the persisted boolean with a not-saved notice', () => {
    for (const name of ['handleToggleCategory', 'handleToggleAppRule']) {
      const body = handlerBody(name);
      expect(body, `${name} must branch on persisted`).toMatch(/persisted\s*\?/);
      expect(body, `${name} must warn when the write was refused`).toMatch(/NOT SAVED/);
      expect(body, `${name} must say the change reverts on reload`).toMatch(/reverts on reload/);
    }
  });
});

describe('AndroidPermissionCenter "Grant All & Pair" names the simulation, not a live handset', () => {
  // `handleGrantAll` calls `simulatedAndroidAdapter.connect()`, which registers
  // the SIMULATION_ONLY testbed and yields LIMITED_CAPABILITY. The success
  // message used to say "Testbed paired", which reads as a real device
  // connection on a screen whose purpose is hardware truth. The message must
  // name the simulation and surface the real negotiated status.
  const grantAllBody = handlerBody('handleGrantAll');

  it('imports only the simulated adapter, never the real one', () => {
    expect(source).toMatch(/import \{ simulatedAndroidAdapter \}/);
    expect(source).not.toMatch(/\brealAndroidAdapter\b/);
  });

  it('does not claim a bare "Testbed paired" success', () => {
    expect(grantAllBody).not.toMatch(/Testbed paired/);
  });

  it('names the simulation and reports the negotiated status', () => {
    expect(grantAllBody).toMatch(/Simulation testbed paired/);
    expect(grantAllBody).toMatch(/no live handset connected/);
    expect(grantAllBody).toMatch(/simStatus/);
    expect(grantAllBody).toMatch(/androidBridgeEngine\.getStatus\(\)/);
  });
});

describe('AndroidPermissionCenter refusal notices name the stored value, never a memory-only one', () => {
  // `updatePermission` and `updateSettings` revert their in-memory value when
  // the durable store refuses the write. A refusal notice that promised the
  // requested value "in memory only" therefore asserted a state that does not
  // exist, while the row rendered right below it showed the old value.
  it('never promises a permission value "in memory only"', () => {
    expect(source).not.toMatch(/in memory only/);
  });

  it('names the stored value the permission row actually holds', () => {
    const body = handlerBody('handleTogglePermState');
    expect(body).toMatch(/androidBridgeEngine\.getPermissions\(\)\[key\]/);
    expect(body).toMatch(/NOT SAVED/);
    expect(body).toMatch(/reverts on reload/);
  });

  it('says the refused grant-all left the permissions at their stored values', () => {
    const body = handlerBody('handleGrantAll');
    expect(body).toMatch(/not saved/);
    expect(body).toMatch(/revert on reload/);
  });
});
