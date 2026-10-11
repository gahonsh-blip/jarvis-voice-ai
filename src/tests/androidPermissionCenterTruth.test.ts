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
  // The handlers are short; take a generous slice ending at the next handler.
  const slice = source.slice(start, start + 900);
  const end = slice.indexOf('\n  };');
  return end >= 0 ? slice.slice(0, end + 4) : slice;
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
