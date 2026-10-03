import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { schedulerRunLogLine } from '../utils/hardening/schedulerRunTruth';

// Regression guard for backlog item 13. `checkAndRunSchedulerJobs` logged
// "Executed <job>" for a routine the moment its time window opened, and for the
// two push routines it did so even though `sendRealTelegramMessage` swallows
// every failure. The log therefore claimed a briefing had gone out when the
// Telegram push had failed (or had not even been attempted). server.ts binds a
// port on import, so the wiring is asserted against the source text and the
// decision logic is exercised directly, matching mobileTelemetryTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

describe('schedulerRunLogLine only claims a delivery that happened', () => {
  it('says "delivered" only when the push was confirmed', () => {
    const line = schedulerRunLogLine('Morning Briefing (09:00 AM IST)', {
      attempted: true,
      delivered: true,
    });
    expect(line).toContain('message delivered to Telegram');
    expect(line).toContain('Morning Briefing');
  });

  it('marks an attempted but failed push as NOT delivered, never as a success', () => {
    const line = schedulerRunLogLine('Nightly Work Summary (10:30 PM IST)', {
      attempted: true,
      delivered: false,
      detail: 'FAILED',
    });
    expect(line).toContain('NOT delivered');
    expect(line).toContain('FAILED');
    expect(line).not.toContain('message delivered to Telegram');
  });

  it('does not invent an execution for a routine that only advanced its marker', () => {
    const line = schedulerRunLogLine('Midday Health Audit (02:00 PM IST)', {
      attempted: false,
      delivered: false,
    });
    expect(line).toContain('schedule advanced');
    expect(line).not.toContain('delivered to Telegram');
  });
});

describe('checkAndRunSchedulerJobs no longer fakes routine success', () => {
  it('no longer logs the unconditional "Executed <job>" claim', () => {
    expect(flat).not.toContain('Executed Morning Briefing');
    expect(flat).not.toContain('Executed Midday Health Audit');
    expect(flat).not.toContain('Executed Evening Social Pulse');
    expect(flat).not.toContain('Executed Nightly Work Summary');
  });

  it('routes every routine through recordSchedulerOutcome', () => {
    const calls = flat.match(/recordSchedulerOutcome\(/g) || [];
    // one definition + four call sites
    expect(calls.length).toBeGreaterThanOrEqual(5);
    expect(flat).toContain('schedulerRunLogLine(name, push)');
  });

  it('awaits the real Telegram delivery result for the push routines', () => {
    expect(flat).toContain('await deliverTelegramMessage(activeTelegramChatId, morningText)');
    expect(flat).toContain('await deliverTelegramMessage(activeTelegramChatId, nightText)');
    expect(flat).not.toContain('sendRealTelegramMessage(activeTelegramChatId, morningText).catch');
    expect(flat).not.toContain('sendRealTelegramMessage(activeTelegramChatId, nightText).catch');
  });

  it('stamps the per-day marker before the awaited push so the window cannot re-fire', () => {
    const marker = flat.indexOf('memoryState.schedulerState.lastMorningRunDate = todayIST;');
    const push = flat.indexOf('await deliverTelegramMessage(activeTelegramChatId, morningText)');
    expect(marker).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(marker);
  });
});
