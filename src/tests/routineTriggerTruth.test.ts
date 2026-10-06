import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { resolveRoutineTrigger, ROUTINE_SLOTS } from '../utils/hardening/routineTriggerTruth';

// Regression guard for backlog item 13. `POST /api/routines/trigger` answered
// `{ success: true, routine }` for every request and fell back to
// `proactiveReports[0]` when the requested slot did not match — so an unknown
// slot, or an empty store (both match and fallback undefined), still read as a
// triggered briefing. server.ts binds a port on import, so the wiring is
// asserted against the source text and the decision logic is exercised directly,
// matching schedulerRunTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

describe('resolveRoutineTrigger accepts only the four real slots', () => {
  it('accepts each slot the report builder produces', () => {
    for (const slot of ROUTINE_SLOTS) {
      const verdict = resolveRoutineTrigger(slot);
      expect(verdict.ok).toBe(true);
      expect(verdict.slot).toBe(slot);
    }
  });

  it('refuses an unknown slot instead of defaulting to the first routine', () => {
    const verdict = resolveRoutineTrigger('midnight');
    expect(verdict.ok).toBe(false);
    expect(verdict.slot).toBeNull();
    expect(verdict.reason).toContain('midnight');
  });

  it('refuses a missing slot instead of silently picking a routine', () => {
    for (const missing of [undefined, null, '']) {
      const verdict = resolveRoutineTrigger(missing);
      expect(verdict.ok).toBe(false);
      expect(verdict.slot).toBeNull();
    }
  });

  it('refuses a non-string slot so a truthy object cannot trigger a routine', () => {
    expect(resolveRoutineTrigger({ timeSlot: 'morning' }).ok).toBe(false);
    expect(resolveRoutineTrigger(0).ok).toBe(false);
  });
});

describe('the routines/trigger route no longer fakes a trigger', () => {
  const route = (() => {
    const start = serverSource.indexOf("app.post('/api/routines/trigger'");
    return serverSource.slice(start, serverSource.indexOf('// =====', start));
  })();

  it('validates the slot before answering and returns success:false on a miss', () => {
    expect(route).toContain('resolveRoutineTrigger(');
    expect(route).toMatch(/success:\s*false/);
    expect(route).toMatch(/status\(400\)/);
  });

  it('no longer falls back to proactiveReports[0] for an unmatched slot', () => {
    expect(route).not.toContain('proactiveReports[0]');
  });
});
