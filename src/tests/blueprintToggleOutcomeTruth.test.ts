// HERMES JARVIS — blueprint deliverable-toggle client honesty (backlog item 13).
//
// `handleToggleDeliverable` in `BlueprintRoadmapModal.tsx` branched only on
// `data.success` and discarded every server refusal. `POST
// /api/blueprint/toggle-item` answers HTTP 400 `{ success: false, error }` for a
// malformed body (unknown phase / out-of-range index) and HTTP 500
// `{ success: false, persisted: false, error }` when a tick could not be written
// to durable storage and was rolled back. The handler showed no notice for
// either, so a click that changed nothing read as if it worked, and a
// non-durable tick looked saved until the next load. This test covers the
// classifier and the wiring that replaced the silent branch.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { blueprintToggleOutcome } from '../utils/hardening/blueprintToggleOutcomeTruth';

const COMPONENT_DIR = path.resolve(__dirname, '../components');
const readComponent = (file: string) => fs.readFileSync(path.join(COMPONENT_DIR, file), 'utf8');

describe('blueprintToggleOutcome only records a tick the server confirmed', () => {
  it('records a real success:true applied reply and asks for a resync', () => {
    const out = blueprintToggleOutcome({ success: true, applied: true, persisted: true, done: true });
    expect(out.recorded).toBe(true);
    expect(out.tone).toBe('success');
    expect(out.refresh).toBe(true);
  });

  it('surfaces the route error for a malformed-body refusal (400)', () => {
    const out = blueprintToggleOutcome({
      success: false,
      applied: false,
      error: 'Phase 9 has no deliverable at index 4; nothing was changed.',
    });
    expect(out.recorded).toBe(false);
    expect(out.tone).toBe('error');
    expect(out.refresh).toBe(false);
    expect(out.message).toContain('nothing was changed');
  });

  it('surfaces the route error for a rolled-back non-durable write (500)', () => {
    const out = blueprintToggleOutcome({
      success: false,
      applied: false,
      persisted: false,
      error: 'Blueprint change could not be written to durable storage; it was not saved.',
    });
    expect(out.recorded).toBe(false);
    expect(out.message).toContain('durable storage');
  });

  it('treats applied:false as a refusal even when success is truthy', () => {
    const out = blueprintToggleOutcome({ success: true, applied: false, error: 'refused' });
    expect(out.recorded).toBe(false);
    expect(out.tone).toBe('error');
  });

  it('never records a malformed body: null / undefined / {} / "ok" / 42 / { success: "true" }', () => {
    for (const body of [null, undefined, {}, 'ok', 42, { success: 'true' }, { success: true, applied: false }]) {
      const out = blueprintToggleOutcome(body);
      // The last entry is the applied:false refusal; the rest are malformed.
      if (body && typeof body === 'object' && (body as any).applied === false) continue;
      expect(out.recorded).toBe(false);
      expect(out.tone).toBe('error');
      expect(out.message.length).toBeGreaterThan(0);
    }
  });

  it('falls back to an honest line when the refusal carries no reason', () => {
    const out = blueprintToggleOutcome({ success: false });
    expect(out.recorded).toBe(false);
    expect(out.message).toContain('not saved');
  });
});

describe('BlueprintRoadmapModal wiring reads the toggle verdict', () => {
  const source = readComponent('BlueprintRoadmapModal.tsx');

  it('reads the response body regardless of HTTP status', () => {
    expect(source).toContain("await res.json().catch(() => null)");
  });

  it('classifies the reply with blueprintToggleOutcome and stores a notice', () => {
    expect(source).toContain('blueprintToggleOutcome(data)');
    expect(source).toContain('setToggleNotice(');
  });

  it('refreshes the checklist only inside the recorded branch, never on a bare success flag', () => {
    expect(source).toContain('if (outcome.refresh)');
    expect(source).not.toMatch(/if \(data\.success\)\s*\{?\s*fetchBlueprint\(\)/);
  });

  it('renders the notice so a refused tick is visible', () => {
    expect(source).toContain('{toggleNotice && (');
  });
});
