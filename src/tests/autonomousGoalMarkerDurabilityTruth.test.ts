import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in nightlyMarkerDurabilityTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

/**
 * The scheduled-autonomous-goals block of `checkAndRunSchedulerJobs`, bounded
 * from the `for (const goal of dueGoals(` loop to the run-history trim.
 */
function goalLoopBlock(): string {
  const start = serverFlat.indexOf('for (const goal of dueGoals(');
  expect(start, 'scheduled-autonomous-goals block missing').toBeGreaterThan(-1);
  const end = serverFlat.indexOf(
    'if (scheduledGoalRuns.length > 100) scheduledGoalRuns.length = 100;',
    start
  );
  expect(end, 'scheduled-autonomous-goals block end missing').toBeGreaterThan(start);
  return serverFlat.slice(start, end);
}

/**
 * Item 13 (zero fake success). The scheduled-autonomous-goal loop stamped
 * `schedulerState.lastAutonomousGoalRuns[goal.id]` and then ran the goal, with
 * only a bare `persistMemory()` (its boolean discarded) between the stamp and
 * the work. `persistMemory()` returns true without writing when the memory file
 * already holds the identical bytes, and on a read-only volume or full disk the
 * write fails outright; either way the per-day marker existed only in memory, so
 * the next boot would find no marker and re-run a goal this process recorded as
 * run. The loop now reads the marker back from disk before running the goal, and
 * when it did not land it clears the in-memory marker and records the gap as a
 * FAILED audit row instead of a run that will not be kept.
 */
describe('item 13 — a scheduled autonomous goal runs only once its per-day marker is durable', () => {
  it('gates the goal on a read-back of its per-day marker', () => {
    expect(goalLoopBlock()).toContain(
      'if (!persistMemory() || !autonomousGoalMarkerOnDisk(goal.id, today)) {'
    );
  });

  it('no longer runs the goal past a bare, discarded persistMemory()', () => {
    // The discarded-result shape this guard exists to prevent.
    expect(goalLoopBlock()).not.toContain('persistMemory(); continue;');
  });

  it('records a truthful NOT-run outcome when the marker did not land', () => {
    const block = goalLoopBlock();
    expect(block).toContain('NOT run: the per-day marker could not be written to durable storage.');
    expect(block).toContain('delete schedState.lastAutonomousGoalRuns[goal.id];');
    expect(block).toContain("'FAILED'");
  });

  it('reads the marker back from disk instead of trusting the boolean', () => {
    const helper = serverFlat.slice(
      serverFlat.indexOf('function autonomousGoalMarkerOnDisk('),
      serverFlat.indexOf('function recordNightlyRun(')
    );
    expect(helper).toContain('fs.readFileSync(MEMORY_FILE_PATH');
    expect(helper).toContain('state?.lastAutonomousGoalRuns?.[goalId] === date');
  });
});
