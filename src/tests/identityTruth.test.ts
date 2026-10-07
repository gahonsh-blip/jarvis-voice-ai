import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  canonicalizeNameCandidate,
  judgeSetNameIntent,
} from '../utils/identityTruth';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import type { MemoryStore } from '../types';

// server.ts binds a port on import, so the route assertion reads the source
// text, matching the convention in remainingFakeSuccess.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

describe('judgeSetNameIntent — a name clause only counts when a name was read', () => {
  it('accepts ordinary single names', () => {
    expect(judgeSetNameIntent('Ravi')).toMatchObject({ kind: 'name', name: 'Ravi' });
    expect(judgeSetNameIntent('Tony Stark')).toMatchObject({ kind: 'name', name: 'Tony Stark' });
    expect(judgeSetNameIntent('रोहन')).toMatchObject({ kind: 'name', name: 'रोहन' });
    expect(judgeSetNameIntent('रोहन है')).toMatchObject({ kind: 'name', name: 'रोहन' });
  });

  it('canonicalizes punctuation and the trailing Hindi copula / honorific', () => {
    expect(canonicalizeNameCandidate('"Ravi"')).toBe('Ravi');
    expect(canonicalizeNameCandidate('Ravi ji')).toBe('Ravi');
    expect(canonicalizeNameCandidate('रोहन जी')).toBe('रोहन');
    expect(canonicalizeNameCandidate('  Bruce   Wayne  ')).toBe('Bruce Wayne');
  });

  it('rejects a pasted sentence, a digit-only payload and an empty payload', () => {
    expect(judgeSetNameIntent('hello how are you')).toEqual({
      kind: 'unusable',
      reason: 'sentence',
      actionExecuted: false,
    });
    expect(judgeSetNameIntent('123')).toEqual({
      kind: 'unusable',
      reason: 'numeric',
      actionExecuted: false,
    });
    expect(judgeSetNameIntent('   ')).toEqual({
      kind: 'unusable',
      reason: 'empty',
      actionExecuted: false,
    });
    expect(judgeSetNameIntent(null)).toEqual({
      kind: 'unusable',
      reason: 'empty',
      actionExecuted: false,
    });
  });
});

describe('/api/chat set_name case is wired to the truth helper', () => {
  it('routes the extracted payload through judgeSetNameIntent', () => {
    const label = serverFlat.indexOf("case 'set_name':");
    expect(label).toBeGreaterThan(-1);
    const body = serverFlat.slice(label, label + 1400);
    expect(body).toContain('judgeSetNameIntent(');
  });

  it('does not claim the identity was recorded on the rejected branch', () => {
    const label = serverFlat.indexOf("case 'set_name':");
    const body = serverFlat.slice(label, label + 1400);
    expect(body).toContain('set_name_rejected');
    expect(body).toContain('actionExecuted = false');
  });
});

describe('offline engine set_name does not record a pasted sentence', () => {
  function freshMemory(): MemoryStore {
    return {
      name: '',
      notes: [],
      customKeyValues: {},
      stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '2026-09-01T00:00:00.000Z' },
    };
  }

  it('leaves the stored name untouched and does not advance the counter', () => {
    const result = processOfflineCommand('my name is hello how are you', freshMemory(), 'en-US');
    expect(result.updatedMemory?.name).toBe('');
    expect(result.updatedMemory?.stats.actionsExecuted).toBe(0);
  });

  it('still records a genuine name and advances the counter', () => {
    const result = processOfflineCommand('My name is Tony Stark', freshMemory(), 'en-US');
    expect(result.intent).toBe('set_name');
    expect(result.actionExecuted).toBe(true);
    expect(result.updatedMemory?.name).toBe('Tony Stark');
    expect(result.updatedMemory?.stats.actionsExecuted).toBe(1);
  });
});

describe('Telegram processMobileCommand set_name is wired to the truth helper', () => {
  // The Telegram path branches on `intentData.intent === 'set_name'` rather than
  // a `case` label, so locate it by that expression.
  const label = serverFlat.indexOf("intentData.intent === 'set_name'");
  const body = serverFlat.slice(label, label + 1400);

  it('locates the Telegram set_name branch', () => {
    expect(label).toBeGreaterThan(-1);
  });

  it('routes the extracted payload through judgeSetNameIntent', () => {
    expect(body).toContain('judgeSetNameIntent(');
  });

  it('does not claim the identity was recorded on the rejected branch', () => {
    expect(body).toContain('set_name_rejected');
    expect(body).toContain('actionExecuted: false');
  });

  it('reports a failed durable write instead of a fake save', () => {
    // A genuine name whose persistMemory() returns false must not still say it
    // was recorded into durable memory banks.
    expect(body).toContain('could not write it to durable storage');
  });
});
