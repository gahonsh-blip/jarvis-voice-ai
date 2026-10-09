// HERMES JARVIS — blueprint deliverable-toggle honesty (backlog item 13).
//
// `POST /api/blueprint/toggle-item` flipped a deliverable's `done` flag on an
// in-process constant and answered `{ success: true }` unconditionally: the tick
// was never persisted (a restart restored the archived checklist), and a
// malformed body (unknown phase / out-of-range index) read as a successful
// toggle. This test covers the classifier, the overlay that restores persisted
// ticks, and the route wiring that replaced the unconditional success.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  applyBlueprintToggle,
  cloneBlueprintPhases,
  overlayPersistedPhases,
  type BlueprintPhase,
} from '../utils/hardening/blueprintToggleTruth';

function phase(id: number, done: boolean[]): BlueprintPhase {
  return {
    id,
    code: `PHASE_${id}`,
    titleEn: `Phase ${id}`,
    titleHi: `चरण ${id}`,
    status: 'in_progress',
    icon: 'ShieldCheck',
    cost: '₹0',
    description: 'desc',
    deliverables: done.map((d, i) => ({ text: `item ${i}`, done: d })),
    commandSample: 'sample',
  };
}

describe('applyBlueprintToggle only reports a toggle it actually applied', () => {
  it('flips the addressed deliverable and reports the new value', () => {
    const phases = [phase(3, [false, true])];
    const v = applyBlueprintToggle(phases, 3, 0);
    expect(v.applied).toBe(true);
    if (!v.applied) return;
    expect(v.done).toBe(true);
    expect(phases[0].deliverables[0].done).toBe(true);
    expect(phases[0].deliverables[1].done).toBe(true);
  });

  it('marks the phase completed only when every deliverable is done', () => {
    const phases = [phase(3, [false, true])];
    const v = applyBlueprintToggle(phases, 3, 0);
    expect(v.applied).toBe(true);
    expect(phases[0].status).toBe('completed');
  });

  it('leaves the phase in_progress while a deliverable is still open', () => {
    const phases = [phase(3, [true, false, false])];
    applyBlueprintToggle(phases, 3, 0); // -> [false, false, false]
    expect(phases[0].status).toBe('in_progress');
  });

  it('refuses an unknown phase instead of answering success', () => {
    const phases = [phase(3, [false])];
    const v = applyBlueprintToggle(phases, 99, 0);
    expect(v.applied).toBe(false);
    if (v.applied) return;
    expect(v.reason).toBe('INVALID_PHASE');
  });

  it('refuses an out-of-range index instead of touching undefined', () => {
    const phases = [phase(3, [false])];
    const v = applyBlueprintToggle(phases, 3, 5);
    expect(v.applied).toBe(false);
    if (v.applied) return;
    expect(v.reason).toBe('INVALID_INDEX');
    expect(phases[0].deliverables[0].done).toBe(false);
  });

  it('refuses a negative, float or non-numeric index', () => {
    const phases = [phase(3, [false, true])];
    for (const bad of [-1, 1.5, '0', null, undefined, NaN]) {
      const v = applyBlueprintToggle(phases, 3, bad);
      expect(v.applied, `index ${String(bad)}`).toBe(false);
    }
  });

  it('refuses a string phaseId rather than coercing it', () => {
    const phases = [phase(3, [false])];
    const v = applyBlueprintToggle(phases, '3', 0);
    expect(v.applied).toBe(false);
  });
});

describe('overlayPersistedPhases restores operator ticks without resurrecting design changes', () => {
  const design = [phase(0, [true, true]), phase(1, [true, true])];

  it('returns an unmodified clone when nothing was persisted', () => {
    const restored = overlayPersistedPhases(design, undefined);
    expect(restored).toEqual(design);
    expect(restored).not.toBe(design);
  });

  it('applies a persisted done flag to the matching deliverable', () => {
    const persisted = cloneBlueprintPhases(design);
    persisted[1].deliverables[0].done = false;
    persisted[1].status = 'in_progress';
    const restored = overlayPersistedPhases(design, persisted);
    expect(restored[1].deliverables[0].done).toBe(false);
    expect(restored[1].deliverables[1].done).toBe(true);
    expect(restored[1].status).toBe('in_progress');
  });

  it('keeps the design titles even if the persisted copy was tampered with', () => {
    const persisted = cloneBlueprintPhases(design);
    persisted[0].titleEn = 'HACKED';
    const restored = overlayPersistedPhases(design, persisted);
    expect(restored[0].titleEn).toBe('Phase 0');
  });

  it('ignores a persisted entry with no matching design phase', () => {
    const restored = overlayPersistedPhases(design, [phase(42, [false])]);
    expect(restored).toEqual(design);
  });

  it('ignores a corrupt (non-array) persisted value', () => {
    expect(overlayPersistedPhases(design, { not: 'an array' })).toEqual(design);
  });
});

describe('the blueprint toggle route reports only a durable, real change', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
  const route = src.slice(src.indexOf("app.post('/api/blueprint/toggle-item'"));
  const body = route.slice(0, route.indexOf("app.get('/api/blueprint/report'"));

  it('classifies the request through applyBlueprintToggle', () => {
    expect(body).toContain('applyBlueprintToggle(blueprintPhases, phaseId, itemIndex)');
  });

  it('refuses a malformed toggle with success:false instead of success:true', () => {
    expect(body).toContain('if (!verdict.applied)');
    expect(body).toContain('success: false');
  });

  it('persists the toggle and fails when the write does not reach disk', () => {
    expect(body).toContain('persistBlueprintPhases()');
    expect(body).toContain('persisted: false');
  });

  it('no longer flips the in-process constant directly', () => {
    expect(body).not.toContain('BLUEPRINT_PHASES.find');
  });
});
