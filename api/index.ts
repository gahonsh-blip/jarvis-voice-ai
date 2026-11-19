/**
 * Vercel entry point for the REAL agent API.
 *
 * The prototype link was serving only the built frontend, so /api/agent/*
 * answered 404 and nothing the UI showed could actually run. This mounts the
 * same router the self-hosted server uses (providers -> agent loop -> tools),
 * so the deployed URL really executes tasks.
 */
import express from 'express';
import { createAgentRouter } from '../src/agent/routes.js';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/api/agent', createAgentRouter());
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'jarvis-agent', at: new Date().toISOString() });
});
export default app;
