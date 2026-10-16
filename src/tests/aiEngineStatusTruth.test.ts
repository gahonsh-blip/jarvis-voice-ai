import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  GEMINI_MODEL,
  aiEngineProviderLabel,
  aiEngineModelName,
} from '../utils/hardening/aiEngineTruth';

// Regression guard for the `/api/daemon/status` AI-engine block. It reported
// `model: 'gemini-2.5-flash'` and a Gemini provider label unconditionally, so a
// process running without GEMINI_API_KEY — answering every request with the
// offline heuristic engine — still advertised a Gemini model that never ran.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

describe('aiEngine truth helpers describe the engine that actually answers', () => {
  it('names the Gemini model only when a key is configured', () => {
    expect(aiEngineModelName(true)).toBe(GEMINI_MODEL);
    expect(aiEngineModelName(false)).toBeNull();
  });

  it('never names a Gemini model when the offline engine is in use', () => {
    expect(aiEngineProviderLabel(false)).toContain('Offline-Safe');
    expect(aiEngineProviderLabel(false)).not.toMatch(/gemini/i);
    expect(aiEngineProviderLabel(true)).toContain('Gemini 2.5 Flash');
  });
});

describe('/api/daemon/status does not hardcode a model that is not running', () => {
  it('does not return a constant gemini model in the aiEngine block', () => {
    // The old literal returned the model regardless of key presence.
    expect(flat).not.toContain(
      "geminiConfigured: Boolean(process.env.GEMINI_API_KEY), model: 'gemini-2.5-flash'",
    );
  });

  it('derives the provider and model from the helper', () => {
    expect(serverSource).toContain('aiEngineProviderLabel(geminiConfigured)');
    expect(serverSource).toContain('aiEngineModelName(geminiConfigured)');
  });
});
