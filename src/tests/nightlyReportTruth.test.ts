import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildNightlyReportText } from '../utils/hardening/nightlyReportTruth';

// Regression guard for backlog item 13. The 10:30 PM IST Telegram routine
// pushed a fixed report claiming "today's work summary has been recorded" (no
// work-summary artifact is written anywhere), "Memory Persistence:
// Synchronized" (the store was never read), and "Daemon Status: Standby &
// Active" (a literal). server.ts binds a port on import, so the wiring is
// asserted against the source text and the composition logic is exercised
// directly, matching schedulerRunTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

describe('buildNightlyReportText claims only what was read back', () => {
  it('says the run marker is durable only when it reached disk', () => {
    const text = buildNightlyReportText({
      runMarkerDurable: true,
      memoryStoreReadable: true,
      daemonPid: 1234,
      commandsRecorded: 7,
    });
    expect(text).toContain('per-day run marker is in durable storage');
    expect(text).toContain('VERIFIED — the memory store was re-read from disk');
    expect(text).toContain('pid 1234');
    expect(text).toContain('Commands Recorded (session)');
  });

  it('reports a marker that did not land as NOT durable, never as recorded', () => {
    const text = buildNightlyReportText({
      runMarkerDurable: false,
      memoryStoreReadable: true,
      daemonPid: 42,
      commandsRecorded: 0,
    });
    expect(text).toContain('did NOT reach durable storage');
    expect(text).not.toContain('is in durable storage');
  });

  it('reports an unreadable store as NOT VERIFIED, never as Synchronized', () => {
    const text = buildNightlyReportText({
      runMarkerDurable: true,
      memoryStoreReadable: false,
      daemonPid: 42,
      commandsRecorded: 3,
    });
    expect(text).toContain('NOT VERIFIED — the memory store could not be read back from disk');
    expect(text).not.toContain('Synchronized');
  });

  it('never asserts a stored work summary', () => {
    const text = buildNightlyReportText({
      runMarkerDurable: true,
      memoryStoreReadable: true,
      daemonPid: 1,
      commandsRecorded: 1,
    });
    expect(text).not.toContain('work summary has been recorded');
    expect(text).not.toContain('Standby & Active');
  });
});

describe('the nightly scheduler tick no longer fakes the report', () => {
  it('removes the three fabricated lines from the pushed text', () => {
    expect(flat).not.toContain('Memory Persistence*: Synchronized');
    expect(flat).not.toContain('Standby & Active');
    expect(flat).not.toContain('work summary has been recorded');
    expect(flat).not.toContain('*Commands Executed*');
  });

  it('composes the report from read-back facts', () => {
    expect(flat).toContain('buildNightlyReportText({');
    expect(flat).toContain("routineMarkerOnDisk('lastNightRunDate', todayIST)");
    expect(flat).toContain('memoryStoreReadable: memoryStoreReadableOnDisk()');
    expect(flat).toContain('function memoryStoreReadableOnDisk()');
  });
});
