/**
 * HTTP surface for the super-agent, mounted next to the existing JARVIS API.
 *
 * POST /api/agent/run     run a task (optionally approved so write/shell tools work)
 * POST /api/agent/stream  same, server-sent events with one event per step
 * GET  /api/agent/status  which providers are configured and usable right now
 * GET  /api/agent/tools   the tool schemas the agent can call
 */
import { Router, type Request, type Response } from 'express';
import { agentStatus, runAgent } from './loop.js';
import { listPersonas, DEFAULT_PERSONA_ID } from './personas.js';
import { listPermissions, grant, revoke, pendingRequests, offlineMode, capabilityForTool } from './permissions.js';
import { setKeyOverride } from './providers.js';
import { TOOL_SPECS, TOOL_COUNT, executeTool } from './tools.js';
import { BRIDGE_TOOL_NAMES, KEY_TOOL_NAMES, bridgeConfigured } from './base44-parity.js';
import { providerStatus } from './providers.js';

function guardToken(req: Request, res: Response): boolean {
  const expected = process.env.AGENT_API_TOKEN;
  if (!expected) return true; // local single-user install, no token configured
  const given = req.header('x-agent-token') || req.query.token;
  if (given === expected) return true;
  res.status(401).json({ ok: false, error: 'unauthorized' });
  return false;
}

export function createAgentRouter(): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const status = agentStatus();
    res.json({
      ...status,
      workspaceRoot: process.env.AGENT_WORKSPACE_ROOT || process.cwd(),
      models: providerStatus(),
    });
  });


  /* Runs every tool once with safe arguments and reports which ones really
     work on this host. This is the honest answer to "does it actually run",
     not a screenshot of a UI. */
  router.get('/selftest', async (_req, res) => {
    const { mkdtempSync } = await import('fs');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const root = mkdtempSync(join(tmpdir(), 'agent-selftest-'));
    const cases: Record<string, Record<string, unknown>> = {
      list_files: { path: '.' },
      read_file: { path: 'selftest.txt' },
      write_file: { path: 'selftest.txt', content: 'hello from selftest' },
      grep_files: { pattern: 'selftest' },
      run_command: { command: 'echo ok' },
      fetch_url: { url: 'https://example.com' },
      web_search: { query: 'base44' },
      git: { action: 'status' },
      remember: { key: 'selftest', value: 'ok' },
      recall: { query: 'selftest' },
      time_now: {},
      http_request: { url: 'https://api.github.com/zen' },
      hash_text: { text: 'abc' },
      json_get: { json: '{"a":{"b":[1,2]}}', path: 'a.b.0' },
      memory_set: { key: 'selftest', value: 'ok' },
      memory_get: { key: 'selftest' },
      // Base44-parity tools that really run on this host.
      run_skill: { skill_name: 'selftest' },
      ask_clarifying_questions: { questions: [{ question: 'Which hall?', options: [{ label: 'Main' }] }] },
    };
    const { writeFileSync } = await import('fs');
    try { writeFileSync(join(root, 'selftest.txt'), 'hello from selftest'); } catch { /* ignore */ }

    // The selftest is the owner's own check, so it runs against a throwaway
    // permission store with the four capabilities it needs already granted.
    // The real store is untouched: a selftest never widens the owner's grants.
    const previousStateDir = process.env.AGENT_STATE_DIR;
    process.env.AGENT_STATE_DIR = join(root, '.permissions');
    for (const cap of ['files.write', 'shell', 'network', 'memory'] as const) grant(cap);
    /* A tiny skill so run_skill has something real to execute. */
    try {
      const { mkdirSync } = await import('fs');
      mkdirSync(join(root, '.agents', 'skills'), { recursive: true });
      writeFileSync(join(root, '.agents', 'skills', 'selftest.sh'), 'echo skill-ok\n');
    } catch { /* ignore */ }

    const bridgeNames = new Set(BRIDGE_TOOL_NAMES);
    const keyNames = new Set(KEY_TOOL_NAMES);
    const bridgeOn = bridgeConfigured();

    const results = [] as Array<{ tool: string; group: string; ok: boolean; ms: number; output: string }>;
    for (const spec of TOOL_SPECS) {
      // Bridge tools cannot run here without the Base44 keys; say so plainly
      // instead of calling them "no test case" or pretending they passed.
      if (bridgeNames.has(spec.name)) {
        results.push({
          tool: spec.name,
          group: 'bridge',
          ok: bridgeOn,
          ms: 0,
          output: bridgeOn
            ? 'bridge configured — not called by selftest (would act for real)'
            : 'bridge: needs BASE44_API_URL, BASE44_API_KEY, BASE44_AGENT_ID',
        });
        continue;
      }
      if (keyNames.has(spec.name)) {
        const key = process.env.OPENAI_API_KEY ? 'OPENAI_API_KEY present' : 'needs OPENAI_API_KEY';
        results.push({ tool: spec.name, group: 'key', ok: Boolean(process.env.OPENAI_API_KEY), ms: 0, output: key });
        continue;
      }
      const args = cases[spec.name];
      if (!args) { results.push({ tool: spec.name, group: 'native', ok: false, ms: 0, output: 'no test case' }); continue; }
      const started = Date.now();
      const out = await executeTool(spec.name, args, { root, approved: true } as any);
      results.push({
        tool: spec.name,
        group: 'native',
        ok: Boolean(out.ok),
        ms: Date.now() - started,
        output: String(out.output ?? '').slice(0, 200).replace(/\s+/g, ' '),
      });
    }

    if (previousStateDir === undefined) delete process.env.AGENT_STATE_DIR;
    else process.env.AGENT_STATE_DIR = previousStateDir;

    const native = results.filter((r) => r.group === 'native');
    const bridge = results.filter((r) => r.group === 'bridge');
    const key = results.filter((r) => r.group === 'key');
    const passed = native.filter((r) => r.ok).length;
    res.json({
      total: results.length,
      advertised: TOOL_COUNT,
      native: { total: native.length, passed, failed: native.length - passed },
      bridge: { total: bridge.length, configured: bridgeOn },
      key: { total: key.length, configured: Boolean(process.env.OPENAI_API_KEY) },
      results,
    });
  });

  /* ---------------------------- permissions ---------------------------- */
  /* The app-style consent surface: what is allowed, what is waiting for an
     answer, and the two calls that answer it. */
  router.get('/permissions', (_req, res) => {
    res.json({ offline: offlineMode(), capabilities: listPermissions(), pending: pendingRequests() });
  });

  router.post('/permissions/grant', (req, res) => {
    if (!guardToken(req, res)) return;
    const capability = String(req.body?.capability || '').trim();
    const result = grant(capability as any, String(req.body?.note || 'owner approved'));
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true, capabilities: listPermissions(), pending: pendingRequests() });
  });

  router.post('/permissions/revoke', (req, res) => {
    if (!guardToken(req, res)) return;
    const capability = String(req.body?.capability || '').trim();
    const result = revoke(capability as any);
    if (!result.ok) return res.status(400).json(result);
    res.json({ ok: true, capabilities: listPermissions() });
  });

  router.get('/permissions/capability/:tool', (req, res) => {
    res.json({ tool: req.params.tool, capability: capabilityForTool(req.params.tool) });
  });

  router.get('/personas', (_req, res) => {
    res.json({ default: DEFAULT_PERSONA_ID, personas: listPersonas() });
  });

  router.get('/tools', (_req, res) => {
    res.json({
      count: TOOL_COUNT,
      groups: {
        native: TOOL_COUNT - BRIDGE_TOOL_NAMES.length - KEY_TOOL_NAMES.length,
        bridge: BRIDGE_TOOL_NAMES.length,
        key: KEY_TOOL_NAMES.length,
      },
      tools: TOOL_SPECS,
    });
  });

  router.post('/run', async (req, res) => {
    if (!guardToken(req, res)) return;
    const task = String(req.body?.task || '').trim();
    if (!task) {
      res.status(400).json({ ok: false, error: 'task_required' });
      return;
    }
    // A key supplied by the caller for this one run (BYO key, never stored).
    setKeyOverride(String(req.header('x-gemini-key') || req.body?.geminiKey || ''));
    const result = await runAgent({
      task,
      persona: req.body?.persona,
      approved: Boolean(req.body?.approved),
      maxSteps: Number(req.body?.maxSteps) || undefined,
      root: req.body?.root,
    });
    res.status(result.ok ? 200 : 200).json(result);
  });

  router.post('/stream', async (req, res) => {
    if (!guardToken(req, res)) return;
    const task = String(req.body?.task || '').trim();
    if (!task) {
      res.status(400).json({ ok: false, error: 'task_required' });
      return;
    }
    res.setHeader('content-type', 'text/event-stream');
    res.setHeader('cache-control', 'no-cache');
    res.setHeader('connection', 'keep-alive');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const result = await runAgent({
      task,
      persona: req.body?.persona,
      approved: Boolean(req.body?.approved),
      maxSteps: Number(req.body?.maxSteps) || undefined,
      root: req.body?.root,
      onStep: (step) => send('step', step),
    });
    send('done', { ok: result.ok, answer: result.answer, durationMs: result.durationMs });
    res.end();
  });

  return router;
}
