import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in nightlyRunRecordDurabilityTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

/**
 * The nightly-GitHub-check block of `checkAndRunSchedulerJobs`, bounded from the
 * `lastGithubNightlyRunDate !== todayIST` guard to the end of the check.
 */
function nightlyBlock(): string {
  const start = serverFlat.indexOf('if (schedState.lastGithubNightlyRunDate !== todayIST)');
  expect(start, 'nightly-check block missing').toBeGreaterThan(-1);
  return serverFlat.slice(start, start + 2400);
}

/**
 * Item 13 (zero fake success). The scheduled nightly GitHub check stamped the
 * per-day marker (`lastGithubNightlyRunDate`), logged "Started Nightly
 * Repository Check", and called a bare `persistMemory()` whose boolean nobody
 * read before launching the scan. `persistMemory()` returns true without writing
 * when the memory file already holds the identical bytes, so on a read-only
 * volume or a full disk the marker (and the start log line) existed only in
 * memory: the next boot would find no marker and re-run a check this process had
 * already recorded as started. The branch now reads the marker back from disk
 * before starting the scan, and when it did not land it skips the scan and
 * records the gap instead of a start that will not be kept.
 */
describe('item 13 — the nightly check reports a start only once its marker is durable', () => {
  it('no longer launches the scan on a bare, unread persistMemory()', () => {
    const block = nightlyBlock();
    // The discarded-result shape this guard exists to prevent.
    expect(block).not.toContain('persistMemory(); runNightlyCheck(');
  });

  it('gates the scan on a read-back of the per-day marker', () => {
    expect(nightlyBlock()).toContain(
      'if (!persistMemory() || !nightlyMarkerOnDisk(todayIST)) {'
    );
  });

  it('records a truthful NOT-started outcome when the marker did not land', () => {
    const block = nightlyBlock();
    expect(block).toContain('Nightly Repository Check NOT started');
    expect(block).toContain('addAuditLog(');
    expect(block).toContain("'FAILED'");
  });

  it('reads the marker back from disk instead of trusting the boolean', () => {
    const helper = serverFlat.slice(
      serverFlat.indexOf('function nightlyMarkerOnDisk('),
      serverFlat.indexOf('function recordNightlyRun(')
    );
    expect(helper).toContain('fs.readFileSync(MEMORY_FILE_PATH');
    expect(helper).toContain('state?.lastGithubNightlyRunDate === date');
  });
});
