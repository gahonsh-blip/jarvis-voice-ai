import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyMemoryUpdate } from '../utils/hardening/memoryUpdateTruth';

// Regression guard for backlog item 13. `POST /api/memory` answered
// `success: true` for every request, spreading whatever the caller sent over
// the stored memory: a body with no real field was reported as a save, and a
// malformed value was written straight into the memory the app reads back.
// server.ts binds a port on import, so the wiring is asserted against the
// source text and the decision logic is exercised directly.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

const current = {
  name: 'Sir',
  notes: [{ id: 'n1', title: 'kept', content: 'kept' }],
  customKeyValues: { city: 'Pune' },
};

describe('classifyMemoryUpdate only stores real memory fields', () => {
  it('applies a real name that differs from the stored value', () => {
    const verdict = classifyMemoryUpdate({ name: 'Boss' }, current);
    expect(verdict.success).toBe(true);
    expect(verdict.stored).toBe(true);
    expect(verdict.outcome).toBe('APPLIED');
    expect(verdict.applied).toEqual({ name: 'Boss' });
  });

  it('applies a real notes array', () => {
    const notes = [{ id: 'n2', title: 'new', content: 'new' }];
    const verdict = classifyMemoryUpdate({ notes }, current);
    expect(verdict.success).toBe(true);
    expect(verdict.stored).toBe(true);
    expect(verdict.outcome).toBe('APPLIED');
    expect(verdict.applied.notes).toEqual(notes);
  });

  it('applies a real customKeyValues object', () => {
    const verdict = classifyMemoryUpdate({ customKeyValues: { city: 'Delhi' } }, current);
    expect(verdict.success).toBe(true);
    expect(verdict.outcome).toBe('APPLIED');
    expect(verdict.applied.customKeyValues).toEqual({ city: 'Delhi' });
  });

  it('reports a repeat of the stored value as stored-but-unchanged', () => {
    const verdict = classifyMemoryUpdate({ name: 'Sir' }, current);
    expect(verdict.success).toBe(true);
    expect(verdict.stored).toBe(true);
    expect(verdict.outcome).toBe('UNCHANGED');
  });

  it('refuses an empty object that carries no memory field', () => {
    const verdict = classifyMemoryUpdate({}, current);
    expect(verdict.success).toBe(false);
    expect(verdict.stored).toBe(false);
    expect(verdict.outcome).toBe('NOTHING_TO_APPLY');
    expect(verdict.applied).toEqual({});
  });

  it('refuses a non-object body as invalid rather than a save', () => {
    for (const bad of [null, undefined, [], 'name', 42]) {
      const verdict = classifyMemoryUpdate(bad, current);
      expect(verdict.success).toBe(false);
      expect(verdict.stored).toBe(false);
      expect(verdict.outcome).toBe('INVALID_BODY');
    }
  });

  it('refuses a counter-only body as stored:false, not a completed save', () => {
    const verdict = classifyMemoryUpdate(
      { statUpdate: { incrementAction: true, incrementCommand: true } },
      current
    );
    expect(verdict.success).toBe(true);
    expect(verdict.stored).toBe(false);
    expect(verdict.outcome).toBe('COUNTER_REFUSED');
    expect(verdict.inertCounterRequest).toBe(true);
  });

  it('rejects a malformed value rather than writing it into memory', () => {
    const verdict = classifyMemoryUpdate(
      { name: 7, notes: 'not-an-array', customKeyValues: { city: 42 } },
      current
    );
    expect(verdict.success).toBe(false);
    expect(verdict.stored).toBe(false);
    expect(verdict.outcome).toBe('NOTHING_TO_APPLY');
    expect(verdict.rejected).toEqual(['name', 'notes', 'customKeyValues']);
  });

  it('rejects an empty-string name that would blank the stored value', () => {
    const verdict = classifyMemoryUpdate({ name: '' }, current);
    expect(verdict.success).toBe(false);
    expect(verdict.rejected).toEqual(['name']);
  });

  it('applies the real fields and rejects the bad ones in a mixed body', () => {
    const verdict = classifyMemoryUpdate({ name: 'Boss', notes: 'nope' }, current);
    expect(verdict.success).toBe(true);
    expect(verdict.stored).toBe(true);
    expect(verdict.outcome).toBe('APPLIED');
    expect(verdict.applied).toEqual({ name: 'Boss' });
    expect(verdict.rejected).toEqual(['notes']);
  });
});

describe('the memory route no longer fakes a save', () => {
  const route = (() => {
    const start = serverSource.indexOf("app.post('/api/memory'");
    return serverSource.slice(
      start,
      serverSource.indexOf('// TELEPHONY & AUTONOMOUS VOICE AGENT ENGINE', start)
    );
  })();

  it('classifies the update before storing it', () => {
    expect(route).toContain('classifyMemoryUpdate(');
  });

  it('refuses a body with nothing to apply instead of answering success', () => {
    expect(route).toMatch(/stored:\s*false/);
    expect(route).toMatch(/success:\s*false/);
  });

  it('no longer writes a raw caller-supplied name or notes directly', () => {
    expect(route).not.toMatch(/memoryState\.name\s*=\s*name\b/);
    expect(route).not.toMatch(/memoryState\.notes\s*=\s*notes\b/);
  });
});
