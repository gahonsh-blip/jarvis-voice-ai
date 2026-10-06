import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import { MemoryStore } from '../types';

// The offline engine credits executed work through the single `countAction`
// helper, so the counter cannot drift from the `actionExecuted` verdict. This
// test pins both the source shape (no ad-hoc `+= 1`) and the runtime invariant
// on the real command paths, because a counter that advances for work the
// engine did not do — or does not advance for work it reports as done — is the
// fake-success shape item 13 exists to prevent.
const engineSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/utils/localJarvisEngine.ts'),
  'utf8',
);

function freshMemory(): MemoryStore {
  return {
    name: '',
    notes: [],
    customKeyValues: {},
    stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '2026-09-01T00:00:00.000Z' },
  };
}

/**
 * Real commands spanning the true, false and no-action branches. Every entry is
 * a phrase the engine recognises today; the assertion is the relation between
 * the verdict and the counter, not the specific intent, so the table stays
 * valid as branches evolve.
 */
const COMMAND_MATRIX = [
  'my name is Tony Stark',
  'switch to hindi',
  'hindi mode',
  'english mode',
  'hinglish mode',
  'auto language',
  'where am i',
  'open calculator',
  'what is 2 + 2',
  'calculate 15 * 3',
  'open notepad',
  'open telephony hub',
  'call history',
  'open paint',
  'project blueprint',
  'quotation',
  'social post linkedin',
  'security audit',
  'cloud telemetry oracle',
  'daily routine schedule',
  'search for cats',
  'open computer operator',
  'take screenshot',
  'clinic hours',
  'volume up',
  'hello there',
  'call mom',
  'answer the call',
  'hang up',
  'reject call',
  'make a phone call to +911234567890',
  'emergency stop',
  'emergency resume',
  'stop',
  'find document report.pdf',
  'create file notes.txt',
  'morning briefing',
  'git status',
  'open chrome',
  'open chatgpt',
  'play music',
  'मेरा नाम राहुल है',
  'हिंदी में बोलो',
  'कंप्यूटर ऑपरेटर खोलो',
  'कैलकुलेटर खोलो',
  'random unrecognized phrase xyzzy',
  'what is the weather',
  'tell me a joke',
];

describe('item 13 — the offline action counter cannot drift from the verdict', () => {
  it('the engine keeps a single increment helper and no ad-hoc counter bump', () => {
    // A stray `updatedMemory.stats.actionsExecuted += 1` is how the counter
    // silently diverged from the verdict before the sweep; pin its absence.
    expect(engineSource).not.toMatch(/updatedMemory\.stats\.actionsExecuted\s*\+=/);
    // The helper must gate the increment on the verdict rather than counting
    // every call.
    expect(engineSource).toMatch(/if \(actionExecuted !== false\) memory\.stats\.actionsExecuted \+= 1;/);
  });

  it('the counter advances exactly when the engine reports the action executed', () => {
    for (const input of COMMAND_MATRIX) {
      const result = processOfflineCommand(input, freshMemory(), 'en-US');
      const delta = result.updatedMemory?.stats.actionsExecuted ?? -1;
      const expected = result.actionExecuted === true ? 1 : 0;
      expect(
        delta,
        `"${input}" (intent ${result.intent}) reported actionExecuted=${result.actionExecuted} but moved the counter by ${delta}`,
      ).toBe(expected);
    }
  });

  it('the language switch counts as executed work, matching its true verdict', () => {
    // Regression pin: the switch branch returned `actionExecuted: true` without
    // advancing the counter, so the reply said the mode changed while the
    // "actions executed" total stayed still.
    const result = processOfflineCommand('switch to hindi', freshMemory(), 'en-US');
    expect(result.intent).toBe('language_switch');
    expect(result.actionExecuted).toBe(true);
    expect(result.updatedMemory?.stats.actionsExecuted).toBe(1);
  });

  it('a refusal or an unrecognised command never moves the counter', () => {
    for (const input of ['stop', 'random unrecognized phrase xyzzy', 'tell me a joke']) {
      const result = processOfflineCommand(input, freshMemory(), 'en-US');
      expect(result.actionExecuted, `${input} should not report work`).not.toBe(true);
      expect(result.updatedMemory?.stats.actionsExecuted, `${input} moved the counter`).toBe(0);
    }
  });
});
