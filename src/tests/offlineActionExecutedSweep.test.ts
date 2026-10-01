import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// The offline engine is a plain module, but the sweep reads it as source text so
// the assertion can enumerate every literal `actionExecuted: true` the same way
// actionExecutedSweepAudit.test.ts does for server.ts. Both halves of item 13
// (online + offline) must stay enumerated so an unaudited `true` cannot be added
// without a reviewer noticing.
const engineFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/utils/localJarvisEngine.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const appFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8')
  .replace(/\s+/g, ' ');

/**
 * Every intent whose offline branch returns `actionExecuted: true`, with the
 * observable work that justifies the flag. Each entry was audited by reading the
 * branch body, not inferred from the name.
 *
 *  - `view`   — `handleExecuteAction` in App.tsx calls setActiveApp() for it.
 *  - `memory` — the branch performs a real persisted write and opens no view.
 */
const AUDITED_OFFLINE_TRUE_INTENTS: Record<string, 'view' | 'memory'> = {
  language_switch: 'view',
  set_name: 'memory', // memoryState.name + persistMemory(); no view opens
  location_services: 'view',
  open_calculator: 'view',
  open_notepad: 'view',
  telephony_hub: 'view',
  call_history: 'view',
  open_paint: 'view',
  check_project: 'view',
  generate_quotation: 'view',
  create_social_post: 'view',
  security_audit: 'view',
  cloud_telemetry: 'view',
  schedule_morning_report: 'view',
  google_search: 'view',
};

/**
 * Intents whose own return object sets `actionExecuted: true`. The `intent` key
 * and the flag must sit in the same return literal, so the window is bounded
 * well inside the longest branch reply string.
 */
function offlineTrueIntents(): string[] {
  const re = /intent: '([a-z_]+)'[^}]{0,700}?actionExecuted: true/g;
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(engineFlat)) !== null) found.push(m[1]);
  return found;
}

/** True when App.tsx routes the intent to a real in-app view. */
function routesToView(intent: string): boolean {
  const at = appFlat.indexOf(`case '${intent}':`);
  if (at === -1) return false;
  return appFlat.slice(at, at + 260).includes('setActiveApp(');
}

describe('item 13 — the offline engine actionExecuted sweep is enumerated and pinned', () => {
  const intents = offlineTrueIntents();

  it('every same-return literal true is an audited intent', () => {
    expect(new Set(intents)).toEqual(new Set(Object.keys(AUDITED_OFFLINE_TRUE_INTENTS)));
  });

  it('every audited intent is still emitted by the engine', () => {
    for (const intent of Object.keys(AUDITED_OFFLINE_TRUE_INTENTS)) {
      expect(intents, `${intent} no longer sets actionExecuted true`).toContain(intent);
    }
  });

  it('each view-backed intent is actually routed by App.tsx to a view', () => {
    for (const [intent, kind] of Object.entries(AUDITED_OFFLINE_TRUE_INTENTS)) {
      if (kind !== 'view') continue;
      expect(routesToView(intent), `${intent} credits a view it does not open`).toBe(true);
    }
  });

  it('set_name justifies the flag with a validated, persisted write', () => {
    // The offline branch only credits work after judgeSetNameIntent() accepts a
    // plausible name and the name is written into the returned memory, which
    // App.tsx persists via saveLocalMemory(). An unvalidated write would be the
    // original fake-success shape.
    const start = engineFlat.indexOf('judgeSetNameIntent(rawCandidate)');
    expect(start, 'offline set_name validation guard missing').toBeGreaterThan(-1);
    const branch = engineFlat.slice(start, start + 700);
    expect(branch).toContain("nameVerdict.kind === 'name'");
    expect(branch).toContain('name: extractedName');
    expect(branch).toContain('actionExecuted: true');
    expect(appFlat).toContain('saveLocalMemory(localResult.updatedMemory)');
  });
});
