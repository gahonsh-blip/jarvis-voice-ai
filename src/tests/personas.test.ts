import { describe, it, expect } from 'vitest';
import {
  PERSONAS,
  DEFAULT_PERSONA_ID,
  resolvePersona,
  listPersonas,
  buildSystemPrompt,
} from '../agent/personas.js';
import { SYSTEM_PROMPT } from '../agent/prompt.js';
import { agentStatus } from '../agent/loop.js';

describe('personas — one registry, several voices', () => {
  it('ships the engineer default and the formal college assistant', () => {
    expect(Object.keys(PERSONAS).sort()).toEqual(['college', 'jarvis']);
    expect(DEFAULT_PERSONA_ID).toBe('jarvis');
  });

  it('keeps the default persona byte-identical to the base prompt', () => {
    expect(resolvePersona('jarvis').systemPrompt).toBe(SYSTEM_PROMPT);
    expect(buildSystemPrompt()).toBe(SYSTEM_PROMPT);
  });

  it('falls back to the default for unknown, empty or hostile ids', () => {
    for (const bad of ['', '   ', 'unknown', null, undefined, 'constructor', '__proto__']) {
      expect(resolvePersona(bad as any).id).toBe(DEFAULT_PERSONA_ID);
    }
    // A case/space-insensitive real id still resolves to itself.
    expect(resolvePersona('  College ').id).toBe('college');
  });

  it('college persona talks like a person and refuses robotic openers', () => {
    const p = resolvePersona('college');
    expect(p.systemPrompt).toContain('COLLEGE ASSISTANT');
    expect(p.systemPrompt).toContain('aap');
    expect(p.systemPrompt).toMatch(/Never open with "As an AI"/);
    expect(p.systemPrompt).toContain('Never invent');
  });

  it('college persona covers the real college chores', () => {
    const prompt = resolvePersona('college').systemPrompt;
    for (const topic of ['Timetable', 'exam dates', 'fees', 'scholarship', 'hostel', 'library', 'bonafide', 'migration', 'leave application']) {
      expect(prompt).toContain(topic);
    }
  });

  it('a persona never loosens the worker rules or the tool protocol', () => {
    const college = resolvePersona('college').systemPrompt;
    expect(college).toContain('TOOLS');
    expect(college).toContain('approval_required');
    expect(college).toContain('Never run destructive commands');
    expect(college.startsWith(SYSTEM_PROMPT)).toBe(true);
  });

  it('lists personas with an id, label and summary for the UI', () => {
    const list = listPersonas();
    expect(list.length).toBe(2);
    for (const p of list) {
      expect(p.id.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(0);
      expect(p.summary.length).toBeGreaterThan(0);
    }
  });

  it('status advertises the personas so a caller knows what to ask for', () => {
    const status = agentStatus() as any;
    expect(status.defaultPersona).toBe('jarvis');
    expect(status.personas.map((p: any) => p.id).sort()).toEqual(['college', 'jarvis']);
  });

  it('no persona prompt is empty or leaves a hole from a failed import', () => {
    for (const p of Object.values(PERSONAS)) {
      expect(p.systemPrompt.length).toBeGreaterThan(500);
      expect(p.systemPrompt).not.toContain('undefined');
    }
  });
});
