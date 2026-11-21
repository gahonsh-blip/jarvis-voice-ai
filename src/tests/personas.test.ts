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
  it('ships the engineer default and the live call agent', () => {
    expect(Object.keys(PERSONAS).sort()).toEqual(['call', 'jarvis']);
    expect(DEFAULT_PERSONA_ID).toBe('jarvis');
    expect(PERSONAS.college).toBeUndefined();
  });

  it('keeps the default persona byte-identical to the base prompt', () => {
    expect(resolvePersona('jarvis').systemPrompt).toBe(SYSTEM_PROMPT);
    expect(buildSystemPrompt()).toBe(SYSTEM_PROMPT);
  });

  it('falls back to the default for unknown, empty or hostile ids', () => {
    for (const bad of ['', '   ', 'unknown', 'college', null, undefined, 'constructor', '__proto__']) {
      expect(resolvePersona(bad as any).id).toBe(DEFAULT_PERSONA_ID);
    }
    // A case/space-insensitive real id still resolves to itself.
    expect(resolvePersona('  Call ').id).toBe('call');
  });

  it('call agent is written for speech, not for a screen', () => {
    const p = resolvePersona('call');
    expect(p.systemPrompt).toContain('CALL AGENT');
    expect(p.systemPrompt).toContain('No markdown, no bullet points');
    expect(p.systemPrompt).toContain('one or two short sentences');
    expect(p.systemPrompt).toContain('Ask exactly one question at a time');
    expect(p.systemPrompt).toContain('Never talk over the caller');
    expect(p.systemPrompt).toMatch(/Never read a raw digit string/);
    expect(p.systemPrompt).toMatch(/Never open with "As an AI"/);
  });

  it('call agent covers the real phone chores', () => {
    const prompt = resolvePersona('call').systemPrompt;
    for (const topic of ['booking', 'availability', 'timings', 'rates', 'Take a message', 'callback', 'complaint']) {
      expect(prompt).toContain(topic);
    }
  });

  it('call agent stays honest and never impersonates a human when asked', () => {
    const prompt = resolvePersona('call').systemPrompt;
    expect(prompt).toContain('Never invent a date, a rate');
    expect(prompt).toMatch(/whether you are a human or a recording, answer truthfully/);
    expect(prompt).toContain('Never ask for a password, OTP, card number');
    expect(prompt).toContain('never say a payment was received');
  });

  it('a persona never loosens the worker rules or the tool protocol', () => {
    const call = resolvePersona('call').systemPrompt;
    expect(call).toContain('TOOLS');
    expect(call).toContain('approval_required');
    expect(call).toContain('Never run destructive commands');
    expect(call.startsWith(SYSTEM_PROMPT)).toBe(true);
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
    expect(status.personas.map((p: any) => p.id).sort()).toEqual(['call', 'jarvis']);
  });

  it('no persona prompt is empty or leaves a hole from a failed import', () => {
    for (const p of Object.values(PERSONAS)) {
      expect(p.systemPrompt.length).toBeGreaterThan(500);
      expect(p.systemPrompt).not.toContain('undefined');
    }
  });
});
