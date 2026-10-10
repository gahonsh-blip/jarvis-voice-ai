import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in autonomousGoalMarkerDurabilityTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

/**
 * The four routine scheduler ticks of `checkAndRunSchedulerJobs`, bounded from
 * the Morning Briefing comment to the Nightly Repository Check comment.
 */
function routineBlock(): string {
  const start = serverFlat.indexOf('// 1. Morning Briefing at 09:00 AM IST');
  expect(start, 'routine scheduler block missing').toBeGreaterThan(-1);
  const end = serverFlat.indexOf('// 5. Nightly Repository Check at 03:00 AM IST', start);
  expect(end, 'routine scheduler block end missing').toBeGreaterThan(start);
  return serverFlat.slice(start, end);
}

/**
 * Item 13 (zero fake success). Each routine tick (Morning / Midday / Evening /
 * Night) stamped its per-day marker, then carried an external Telegram push (or
 * a run-log line) and ended on a bare `persistMemory()` whose boolean nobody
 * read. `persistMemory()` returns true without writing when the memory file
 * already holds the identical bytes, and fails outright on a read-only volume or
 * a full disk; either way the marker lived only in memory, so the next boot
 * would re-run the tick and a "delivered" log line could claim a run the durable
 * store lacks. Each tick now reads its marker back from disk before the push,
 * and when it did not land it clears the in-memory stamp and records a FAILED
 * audit row instead of a run that will not be kept.
 */
describe('item 13 — each routine scheduler tick runs only once its per-day marker is durable', () => {
  it('gates every tick on a read-back of its per-day marker', () => {
    const block = routineBlock();
    expect(block).toContain(
      "if (!persistMemory() || !routineMarkerOnDisk('lastMorningRunDate', todayIST)) {"
    );
    expect(block).toContain(
      "if (!persistMemory() || !routineMarkerOnDisk('lastMiddayRunDate', todayIST)) {"
    );
    expect(block).toContain(
      "if (!persistMemory() || !routineMarkerOnDisk('lastEveningRunDate', todayIST)) {"
    );
    expect(block).toContain(
      "if (!persistMemory() || !routineMarkerOnDisk('lastNightRunDate', todayIST)) {"
    );
  });

  it('no longer ends a tick on a bare, discarded persistMemory()', () => {
    const block = routineBlock();
    // The discarded-result shapes this guard exists to prevent.
    expect(block).not.toContain('push); persistMemory();');
    expect(block).not.toContain('{ attempted: false, delivered: false }); persistMemory();');
  });

  it('records a truthful NOT-run outcome when a marker did not land', () => {
    const block = routineBlock();
    expect(block).toContain('NOT run: the per-day marker could not be written to durable storage.');
    expect(block).toContain('delete memoryState.schedulerState.last');
    expect(block).toContain("'FAILED'");
  });

  it('reads the marker back from disk instead of trusting the boolean', () => {
    const helper = serverFlat.slice(
      serverFlat.indexOf('function routineMarkerOnDisk('),
      serverFlat.indexOf('// Reports whether GitHub automation is usable')
    );
    expect(helper).toContain('fs.readFileSync(MEMORY_FILE_PATH');
    expect(helper).toContain('state?.[marker] === date');
  });
});
