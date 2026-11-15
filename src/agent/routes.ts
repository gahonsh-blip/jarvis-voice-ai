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
import { TOOL_SPECS } from './tools.js';
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
