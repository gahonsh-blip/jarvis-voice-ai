import { describe, expect, it } from 'vitest';
import { ADVERTISED_TOOLS, TOOL_COUNT, TOOL_SPECS, findTool, executeTool } from '../agent/tools.js';
import { ALL_87_NAMES, PARITY_GROUPS, bridgeConfigured } from '../agent/base44-parity.js';

/**
 * The owner asked for the full 87-tool surface on the Jarvis server, counted,
 * with nothing missing and nothing silently duplicated. These tests pin that:
 * the advertised list is exactly the 87 Base44 names, every tool has a schema,
 * and a tool that cannot act says so instead of pretending.
 */
describe('Base44 parity — 87 tools, no gaps', () => {
  it('advertises exactly 87 tools', () => {
    expect(TOOL_COUNT).toBe(87);
    expect(TOOL_SPECS).toHaveLength(87);
  });

  it('has no duplicate names', () => {
    const names = TOOL_SPECS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers every name on the owner list', () => {
    const advertised = new Set(TOOL_SPECS.map((t) => t.name));
    const missing = ALL_87_NAMES.filter((n) => !advertised.has(n));
    expect(missing).toEqual([]);
  });

  it('keeps the per-category counts of the owner list', () => {
    const counts = Object.fromEntries(PARITY_GROUPS.map((g) => [g.id, g.tools.length]));
    expect(counts.files).toBe(5);
    expect(counts.memory).toBe(7);
    expect(counts.internet).toBe(16);
    expect(counts.media).toBe(6);
    expect(counts.connectors).toBe(6);
    expect(counts.automation).toBe(8);
    expect(counts.backend).toBe(5);
    expect(counts.database).toBe(6);
    expect(counts.apps).toBe(4);
    expect(counts.messaging).toBe(7);
    expect(counts.settings).toBe(9);
    expect(counts.proactive).toBe(4);
    expect(counts.subagents).toBe(4);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(87);
  });

  it('gives every tool a name, description and object schema', () => {
    for (const t of ADVERTISED_TOOLS) {
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
      expect(t.description.length).toBeGreaterThan(10);
      expect(t.parameters.type).toBe('object');
      expect(typeof t.run).toBe('function');
    }
  });

  it('resolves old names as aliases so nothing that worked before breaks', () => {
    for (const legacy of ['grep_files', 'run_command', 'memory_set', 'recall', 'time_now', 'list_files', 'git']) {
      expect(findTool(legacy), legacy).toBeTruthy();
    }
  });

  it('answers an unconfigured bridge tool honestly instead of faking success', async () => {
    const ctx = { root: process.cwd(), approved: false };
    const res = await executeTool('read_entities', { entity_name: 'Booking' }, ctx);
    if (bridgeConfigured()) {
      // With a bridge key present the call really goes out; only its shape is asserted.
      expect(typeof res.output).toBe('string');
    } else {
      expect(res.ok).toBe(false);
      expect(res.output).toContain('not_configured');
      expect(res.output).toContain('BASE44_API_KEY');
    }
  });

  it('runs a local tool without a network or a key', async () => {
    const ctx = { root: process.cwd(), approved: false };
    const res = await executeTool(
      'ask_clarifying_questions',
      { questions: [{ question: 'Which hall?', options: [{ label: 'Main' }, { label: 'Lawn' }] }] },
      ctx,
    );
    expect(res.ok).toBe(true);
    expect(res.output).toContain('Which hall?');
  });

  it('reports a missing skill instead of failing silently', async () => {
    const ctx = { root: process.cwd(), approved: false };
    const res = await executeTool('run_skill', { skill_name: 'does-not-exist' }, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('skill_not_found');
  });

  it('still refuses unknown tool names', async () => {
    const ctx = { root: process.cwd(), approved: false };
    const res = await executeTool('no_such_tool', {}, ctx);
    expect(res.ok).toBe(false);
    expect(res.output).toContain('unknown_tool');
  });
});
