import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  RECURRING_ROUTINE_IDS,
  daemonSchedulerTruth,
  privacyMatrixTruth,
  schedulerTruth,
} from '../utils/hardening/mobileTelemetryTruth';

// Regression guard for item 13. GET /api/mobile/telemetry used to answer with a
// literal `privacyMatrix.level4Enforced: true` and `systemScheduler.activeJobs: 4`.
// Neither was observed: the Level 4 gate is flippable via /api/security/matrix,
// and the process runs five recurring routines. server.ts binds a port on import,
// so the route assertions read the source text, matching serverHealthTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

describe('privacyMatrix never upgrades an unobserved Level 4 gate to enforced', () => {
  it('reports an explicit true as enforced', () => {
    const t = privacyMatrixTruth(true, ['battery']);
    expect(t.level4Enforced).toBe(true);
    expect(t.level4Label).toContain('Enabled');
  });

  it('reports an explicit false as DISABLED, not enforced', () => {
    const t = privacyMatrixTruth(false, ['battery']);
    expect(t.level4Enforced).toBe(false);
    expect(t.level4Label).toContain('DISABLED');
  });

  it('reports an unobserved gate as null / UNKNOWN, never true', () => {
    for (const v of [undefined, null]) {
      const t = privacyMatrixTruth(v, ['battery']);
      expect(t.level4Enforced).toBeNull();
      expect(t.level4Enforced).not.toBe(true);
      expect(t.level4Label).toContain('UNKNOWN');
    }
  });
});

describe('schedulerTruth counts the routines the process defines', () => {
  it('counts the real recurring routines, not a fixed 4', () => {
    const t = schedulerTruth(undefined, 0);
    expect(RECURRING_ROUTINE_IDS.length).toBe(5);
    expect(t.activeJobs).toBe(5);
    expect(t.activeJobs).not.toBe(4);
  });

  it('adds operator-registered scheduled goals to the count', () => {
    expect(schedulerTruth(undefined, 3).activeJobs).toBe(8);
  });

  it('labels the next briefing as scheduled, not as an observed run', () => {
    const t = schedulerTruth(undefined, 0);
    expect(t.nextBriefing).toContain('scheduled');
    expect(t.morningBriefingLastRun).toBe('not recorded');
  });

  it('reports the recorded last-run date when one exists', () => {
    expect(schedulerTruth('2026-09-25', 0).morningBriefingLastRun).toBe('2026-09-25');
  });
});

describe('GET /api/mobile/telemetry route uses the truth builders', () => {
  it('does not hardcode level4Enforced or a literal activeJobs count', () => {
    const route = flat.slice(
      flat.indexOf("app.get('/api/mobile/telemetry'"),
      flat.indexOf("app.post('/api/mobile/briefing/generate'"),
    );
    expect(route).not.toContain('level4Enforced: true');
    expect(route).not.toContain('activeJobs: 4');
    expect(route).toContain('privacyMatrixTruth(');
    expect(route).toContain('schedulerTruth(');
  });
});

describe('daemonSchedulerTruth counts and labels the routines it is given', () => {
  const routines = [
    { id: 'morning_9am', name: 'Morning Task Briefing', cronOrTime: '09:00 AM IST' },
    { id: 'midday_2pm', name: 'Midday System & Site Audit', cronOrTime: '02:00 PM IST' },
    { id: 'evening_630pm', name: 'Evening Social Growth Pulse', cronOrTime: '06:30 PM IST' },
    { id: 'night_1030pm', name: 'Nightly Work Summary & Backup', cronOrTime: '10:30 PM IST' },
    { id: 'nightly_repo_check', name: 'Nightly Repository Check', cronOrTime: '03:00 AM IST' },
  ];

  it('counts the routines passed in, never a fixed 4', () => {
    const t = daemonSchedulerTruth(routines, 0);
    expect(t.activeJobsCount).toBe(5);
    expect(t.activeJobsCount).not.toBe(4);
  });

  it('adds operator-registered scheduled goals to the count', () => {
    expect(daemonSchedulerTruth(routines, 3).activeJobsCount).toBe(8);
  });

  it('labels every nextRun as a configured plan, not an observation', () => {
    const t = daemonSchedulerTruth(routines, 0);
    expect(t.jobs).toHaveLength(5);
    for (const job of t.jobs) {
      expect(job.nextRun).toContain('configured plan');
      expect(job.nextRun).toContain('not observed');
    }
  });

  it('reports an unrecorded last run as not recorded', () => {
    const t = daemonSchedulerTruth(routines, 0);
    expect(t.jobs[0].lastRun).toBe('not recorded');
    expect(
      daemonSchedulerTruth([{ ...routines[0], lastRunDate: '2026-09-25' }], 0).jobs[0].lastRun,
    ).toBe('2026-09-25');
  });
});

describe('GET /api/daemon/status route uses the scheduler truth builder', () => {
  it('does not hardcode activeJobsCount or a fabricated nextRun literal', () => {
    const route = flat.slice(
      flat.indexOf("app.get('/api/daemon/status'"),
      flat.indexOf("app.get('/api/mobile/telemetry'"),
    );
    expect(route).not.toContain('activeJobsCount: 4');
    expect(route).not.toContain('09:00 AM Tomorrow');
    expect(route).not.toContain('10:30 PM Tonight');
    expect(route).toContain('daemonSchedulerTruth(');
  });
});
