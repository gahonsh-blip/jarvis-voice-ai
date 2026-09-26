import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assembleAiContext } from '../utils/memory/aiContext';

// Regression guard for the Security Matrix claim "Zero Credential Leaks to LLM
// Memory — PROTECTED". Before this fix the badge was a hardcoded literal, the
// `credentialLeakProtection` flag was read nowhere, and `assembleAiContext`
// injected memory notes, custom key/values and conversation history straight
// into the Gemini system prompt with no redaction at all.

const SERVER_PATH = path.resolve(__dirname, '../../server.ts');
const serverSource = fs.readFileSync(SERVER_PATH, 'utf8');
const CONTEXT_PATH = path.resolve(__dirname, '../utils/memory/aiContext.ts');
const contextSource = fs.readFileSync(CONTEXT_PATH, 'utf8');

const GH_TOKEN = `ghp_${'a'.repeat(36)}`;

describe('assembleAiContext redacts credentials before they reach the model', () => {
  it('redacts secrets stored in memory notes', () => {
    const ctx = assembleAiContext({
      notes: [{ id: 'n1', title: 'deploy key', content: `Use ${GH_TOKEN} for pushes` }],
    });
    expect(ctx.systemInstruction).not.toContain(GH_TOKEN);
    expect(ctx.systemInstruction).toContain('[REDACTED_GITHUB_TOKEN]');
    expect(ctx.redactedSecretsCount).toBe(1);
    expect(ctx.redactedCategories).toContain('GitHub Token');
  });

  it('redacts secrets stored in custom key/values', () => {
    const ctx = assembleAiContext({
      customKeyValues: { telegram: '123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi' },
    });
    expect(ctx.systemInstruction).not.toContain('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi');
    expect(ctx.redactedSecretsCount).toBeGreaterThanOrEqual(1);
  });

  it('redacts secrets in the conversation history turns', () => {
    const ctx = assembleAiContext({
      history: [{ role: 'user', content: `my token is ${GH_TOKEN}` }],
    });
    expect(ctx.turns[0].content).not.toContain(GH_TOKEN);
    expect(ctx.redactedSecretsCount).toBe(1);
  });

  it('reports zero redactions and leaves clean text untouched', () => {
    const ctx = assembleAiContext({
      userName: 'Gahon',
      customKeyValues: { protocol: 'V2.5' },
      notes: [{ id: 'n1', title: 'plan', content: 'Ship the Android bridge' }],
    });
    expect(ctx.systemInstruction).toContain('protocol: V2.5');
    expect(ctx.systemInstruction).toContain('plan: Ship the Android bridge');
    expect(ctx.redactedSecretsCount).toBe(0);
    expect(ctx.redactedCategories).toEqual([]);
  });

  it('allows an explicit opt-out for callers that must not redact', () => {
    const ctx = assembleAiContext({
      notes: [{ id: 'n1', title: 'k', content: GH_TOKEN }],
      redactCredentials: false,
    });
    expect(ctx.systemInstruction).toContain(GH_TOKEN);
    expect(ctx.redactedSecretsCount).toBe(0);
  });
});

describe('the Security Matrix credential-leak claim is measured, not asserted', () => {
  it('no longer renders a hardcoded PROTECTED badge', () => {
    const modalPath = path.resolve(__dirname, '../components/SecurityMatrixModal.tsx');
    const modalSource = fs.readFileSync(modalPath, 'utf8');
    expect(modalSource).toContain('securityState?.credentialLeakProtection === true');
    expect(modalSource).toContain('UNKNOWN');
    // The old form asserted the badge with no read of the state.
    expect(modalSource).not.toMatch(/font-bold">\s*PROTECTED\s*<\/span>/);
  });

  it('wires the flag into the model-context call and guards the module', () => {
    expect(serverSource).toContain('redactCredentials: securityMatrixState.credentialLeakProtection');
    expect(contextSource).toContain('auditSecrets');
    expect(contextSource).toContain('input.redactCredentials !== false');
  });
});
