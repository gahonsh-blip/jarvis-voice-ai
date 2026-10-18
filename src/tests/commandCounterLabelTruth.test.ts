import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  commandsReceivedInsight,
  COMMANDS_RECEIVED_LABEL,
} from '../utils/hardening/commandCounterLabelTruth';

// Regression guard for backlog item 13. `memoryState.stats.totalCommands` is
// incremented when a command is *received* (processMobileCommand, POST
// /api/chat), before any intent runs. The night proactive routine published that
// count under the label "Total Commands Executed", crediting work nothing had
// performed — the sibling of the mislabel the nightly Telegram report already
// fixed. server.ts binds a port on import, so the wiring is asserted against the
// source text and the composition logic is exercised directly, matching
// serverHealthTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

describe('commandsReceivedInsight names the counter as received, not executed', () => {
  it('labels the figure as received and disclaims executed work', () => {
    const line = commandsReceivedInsight(7);
    expect(line).toBe('Total Commands Received: 7 (received this session, not a count of executed actions)');
    expect(line).toContain(COMMANDS_RECEIVED_LABEL);
    expect(line).not.toContain('Executed');
  });

  it('never renders a zero or negative figure as a positive count', () => {
    expect(commandsReceivedInsight(0)).toContain('Received: 0');
  });

  it('falls back to zero for a non-finite value instead of printing NaN', () => {
    expect(commandsReceivedInsight(Number.NaN)).toContain('Received: 0');
    expect(commandsReceivedInsight(Number.POSITIVE_INFINITY)).toContain('Received: 0');
  });
});

describe('the night routine no longer labels received commands as executed', () => {
  it('removes the pre-fix executed literal', () => {
    expect(serverFlat).not.toContain("'Total Commands Executed: '");
  });

  it('composes the insight from the truth helper', () => {
    expect(serverFlat).toContain('commandsReceivedInsight(memoryState.stats.totalCommands)');
  });

  it('imports the helper from the hardening module', () => {
    expect(serverFlat).toContain(
      "import { commandsReceivedInsight } from './src/utils/hardening/commandCounterLabelTruth'"
    );
  });
});
