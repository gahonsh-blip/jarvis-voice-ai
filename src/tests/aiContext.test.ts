import { describe, it, expect } from 'vitest';
import { assembleAiContext } from '../utils/memory/aiContext';

const note = (id: string, title: string, content: string) => ({
  id,
  title,
  content,
});

describe('assembleAiContext', () => {
  it('includes the user name and known facts', () => {
    const ctx = assembleAiContext({
      userName: 'Gahon',
      customKeyValues: { protocol: 'V2.5' },
    });
    expect(ctx.systemInstruction).toContain('Gahon');
    expect(ctx.systemInstruction).toContain('protocol: V2.5');
  });

  it('keeps the most recent turns when given more than maxTurns', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: 'user' as const,
      content: `turn ${i}`,
    }));
    const ctx = assembleAiContext({ history, maxTurns: 3 });
    expect(ctx.turns.map((t) => t.content)).toEqual(['turn 7', 'turn 8', 'turn 9']);
    expect(ctx.droppedTurns).toBe(7);
  });

  it('drops the oldest turns first when the budget is tight', () => {
    const history = [
      { role: 'user' as const, content: 'x'.repeat(60) },
      { role: 'user' as const, content: 'recent' },
    ];
    const ctx = assembleAiContext({ history, charBudget: 500, maxTurns: 6 });
    expect(ctx.turns.map((t) => t.content)).toEqual(['x'.repeat(60), 'recent']);
  });

  it('reports notes that did not fit instead of silently truncating', () => {
    const ctx = assembleAiContext({
      charBudget: 520,
      notes: [note('a', 'small', 'ok'), note('b', 'huge', 'x'.repeat(2000))],
    });
    expect(ctx.includedNotes).toEqual(['small: ok']);
    expect(ctx.droppedNotes).toEqual(['huge']);
  });

  it('stays within the budget', () => {
    const ctx = assembleAiContext({
      charBudget: 700,
      notes: Array.from({ length: 20 }, (_, i) => note(String(i), `n${i}`, 'y'.repeat(50))),
      history: Array.from({ length: 20 }, (_, i) => ({ role: 'user' as const, content: 'z'.repeat(60) })),
    });
    expect(ctx.withinBudget).toBe(true);
    expect(ctx.charCount).toBeLessThanOrEqual(700);
  });

  it('handles an empty context without inventing facts', () => {
    const ctx = assembleAiContext({});
    expect(ctx.turns).toEqual([]);
    expect(ctx.includedNotes).toEqual([]);
    expect(ctx.systemInstruction).toContain('Sir / Guest');
  });
});