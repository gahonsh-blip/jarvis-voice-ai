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
import { setKeyOverride } from './providers.js';
import { TOOL_SPECS, executeTool } from './tools.js';
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
    };
    const { writeFileSync } = await import('fs');
    try { writeFileSync(join(root, 'selftest.txt'), 'hello from selftest'); } catch { /* ignore */ }
    const results = [] as Array<{ tool: string; ok: boolean; ms: number; output: string }>;
    for (const spec of TOOL_SPECS) {
      const args = cases[spec.name];
      if (!args) { results.push({ tool: spec.name, ok: false, ms: 0, output: 'no test case' }); continue; }
      const started = Date.now();
      const out = await executeTool(spec.name, args, { root, approved: true } as any);
      results.push({
        tool: spec.name,
        ok: Boolean(out.ok),
        ms: Date.now() - started,
        output: String(out.output ?? '').slice(0, 200).replace(/\s+/g, ' '),
      });
    }
    const passed = results.filter((r) => r.ok).length;
    res.json({ total: results.length, passed, failed: results.length - passed, results });
  });

  router.get('/tools', (_req, res) => {
    res.json({ count: TOOL_SPECS.length, tools: TOOL_SPECS });
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
