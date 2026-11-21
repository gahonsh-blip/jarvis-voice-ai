/**
 * Tool audit — finds schema and behaviour bugs in the 87-tool registry.
 *
 *   npx tsx scripts/audit-tools.mjs
 *
 * It checks every advertised tool's schema, resolves every legacy alias, and
 * actually runs the native tools. Anything that cannot run here must say so
 * with a precise reason (bridge/key), never a fake pass.
 */
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TOOL_SPECS, TOOL_COUNT, findTool, executeTool } from '../src/agent/tools.ts';
import { BRIDGE_TOOL_NAMES, KEY_TOOL_NAMES, ALL_87_NAMES } from '../src/agent/base44-parity.ts';

const bugs = [];
const notes = [];
const bug = (id, detail) => bugs.push({ id, detail });

/* ---------- 1. schema ---------- */
const seen = new Set();
for (const t of TOOL_SPECS) {
  if (!/^[a-z][a-z0-9_]*$/.test(t.name)) bug('schema.name', `${t.name}: not snake_case`);
  if (seen.has(t.name)) bug('schema.dupe', `${t.name}: registered twice`);
  seen.add(t.name);
  if (!t.description || t.description.length < 10) bug('schema.description', `${t.name}: description too short`);
  const p = t.parameters || {};
  if (p.type !== 'object') bug('schema.params', `${t.name}: parameters.type is ${p.type}`);
  if (!p.properties || typeof p.properties !== 'object') bug('schema.params', `${t.name}: no properties`);
  for (const req of p.required || []) {
    if (!p.properties?.[req]) bug('schema.required', `${t.name}: required '${req}' has no property`);
  }
}

/* ---------- 2. manifest vs registry ---------- */
if (TOOL_COUNT !== 87) bug('count', `advertised ${TOOL_COUNT}, expected 87`);
if (ALL_87_NAMES.length !== 87) bug('manifest', `manifest has ${ALL_87_NAMES.length}`);
for (const n of ALL_87_NAMES) if (!seen.has(n)) bug('manifest.missing', `${n} in manifest but not registered`);
for (const n of seen) if (!ALL_87_NAMES.includes(n)) bug('manifest.extra', `${n} registered but not in manifest`);
if (BRIDGE_TOOL_NAMES.length + KEY_TOOL_NAMES.length + 9 !== 87) {
  bug('buckets', `bridge ${BRIDGE_TOOL_NAMES.length} + key ${KEY_TOOL_NAMES.length} + native 9 != 87`);
}

/* ---------- 3. legacy aliases ---------- */
for (const alias of ['grep_files', 'run_command', 'memory_set', 'memory_get', 'recall', 'remember', 'list_files', 'fetch_url', 'git', 'time_now', 'hash_text', 'json_get', 'http_request']) {
  if (!findTool(alias)) bug('alias', `${alias} no longer resolves`);
}

/* ---------- 4. run the native tools for real ---------- */
const root = mkdtempSync(join(tmpdir(), 'tool-audit-'));
mkdirSync(join(root, '.agents', 'skills'), { recursive: true });
writeFileSync(join(root, '.agents', 'skills', 'audit.sh'), '#!/bin/sh\necho skill-ok\n', { mode: 0o755 });
writeFileSync(join(root, 'seed.txt'), 'hello audit\n');

const ctx = { root, approved: true };
// The audit is an owner-run check: grant what it needs in a throwaway store.
process.env.AGENT_STATE_DIR = join(root, '.permissions');
const { grant } = await import('../src/agent/permissions.ts');
for (const cap of ['files.read','files.write','shell','network','memory','messages','calls','publish','payments','platform']) grant(cap);
const cases = [
  ['read_file', { path: 'seed.txt' }, 'hello audit'],
  ['write_file', { path: 'out.txt', content: 'written' }, 'wrote'],
  ['grep', { pattern: 'audit' }, 'seed.txt'],
  ['bash', { command: 'echo ok' }, 'ok'],
  ['run_skill', { skill_name: 'audit' }, 'skill-ok'],
  ['ask_clarifying_questions', { questions: [{ question: 'Which hall?', options: [{ label: 'Main' }] }] }, 'Main'],
  ['save_memory', { key: 'audit', value: 'yes' }, ''],
  ['search_previous_messages', { query: 'audit' }, ''],
  ['web_search', { query: 'base44 agent' }, ''],
];

for (const [name, args, expect] of cases) {
  const out = await executeTool(name, args, ctx);
  if (!out.ok) bug('run', `${name} failed: ${String(out.output).slice(0, 120)}`);
  else if (expect && !String(out.output).includes(expect)) {
    bug('run.output', `${name} ran but output lacks '${expect}': ${String(out.output).slice(0, 120)}`);
  }
}

/* ---------- 5. unrunnable tools must explain themselves ---------- */
for (const name of [...BRIDGE_TOOL_NAMES, ...KEY_TOOL_NAMES]) {
  const out = await executeTool(name, {}, ctx);
  if (out.ok) bug('honesty', `${name} claims success with no credential configured`);
  else if (!/not_configured/.test(String(out.output))) {
    bug('honesty', `${name} failed without a not_configured reason: ${String(out.output).slice(0, 120)}`);
  }
}

console.log(`advertised: ${TOOL_COUNT} | bugs: ${bugs.length}`);
for (const b of bugs) console.log(`  [${b.id}] ${b.detail}`);
if (notes.length) for (const n of notes) console.log(`  note: ${n}`);
process.exit(bugs.length ? 1 : 0);
