// ==============================================================================
// Backlog item 13 — "zero fake success": the nightly GitHub check's audit row.
//
// `runNightlyCheck()` marks the run record `COMPLETED` even for a partial sweep
// (repositories it could not reach), while it marks the receipt `DISPATCHED` in
// that case and reserves `VERIFIED` for a fully clean, remote-confirmed scan.
//
// The scheduler's audit row derived its badge from `record.outcome`
// (`COMPLETED ? 'VERIFIED' : 'FAILED'`), so a partial sweep rendered a green
// "confirmed" badge that was a superset of what the scan's own detail admitted.
// The badge is now derived from the receipt outcome via `nightlyAuditBadge`, so
// a non-verified sweep can never be presented as a confirmed check.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { nightlyAuditBadge, nightlyRunLogLine } from '../utils/github/nightlyAuditTruth';

describe('nightlyAuditBadge maps the check receipt to an honest audit badge', () => {
  it('reports VERIFIED only for a remote-confirmed, fully clean scan', () => {
    expect(nightlyAuditBadge('VERIFIED')).toBe('VERIFIED');
  });

  it('does not present a dispatched-but-unconfirmed sweep as verified', () => {
    // The regression: a partial sweep is `COMPLETED` on the record but
    // `DISPATCHED` on the receipt. The old mapping made this "VERIFIED".
    expect(nightlyAuditBadge('DISPATCHED')).toBe('UNVERIFIED');
  });

  it('does not present an ambiguous or not-set-up sweep as verified', () => {
    for (const outcome of ['UNVERIFIED', 'NOT_CONFIGURED', 'NOT_AVAILABLE', 'PERMISSION_REQUIRED', 'SIMULATION_ONLY'] as const) {
      expect(nightlyAuditBadge(outcome), outcome).toBe('UNVERIFIED');
    }
  });

  it('reports FAILED for a refusal or a hard failure', () => {
    expect(nightlyAuditBadge('FAILED')).toBe('FAILED');
    expect(nightlyAuditBadge('BLOCKED')).toBe('FAILED');
  });
});

describe('the scheduled and manual nightly routes derive the badge from the receipt', () => {
  const serverFlat = fs
    .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
    .replace(/\s+/g, ' ');

  it('never maps the audit badge from the run record outcome again', () => {
    expect(serverFlat).not.toContain("result.record.outcome === 'COMPLETED' ? 'VERIFIED' : 'FAILED'");
  });

  it('routes both call sites through nightlyAuditBadge(result.receipt.outcome)', () => {
    const occurrences = serverFlat.split("nightlyAuditBadge(result.receipt.outcome)").length - 1;
    expect(occurrences).toBe(2);
  });
});

// ==============================================================================
// Backlog item 13 — "zero fake success": the scheduled nightly run log.
//
// The scheduled tick (`server.ts`, block 5 of `checkAndRunSchedulerJobs`) logged
// "Started Nightly Repository Check (03:00 AM IST)" as soon as the per-day marker
// landed — before the scan had produced anything — and then discarded both the
// run-record and audit-row durability verdicts. On a read-only volume or a full
// disk the durable history gained no run, yet the log still asserted the check
// had started. The line is now composed after the check finishes, via
// `nightlyRunLogLine`, and states the receipt outcome, the scan counts, and
// whether each durable write actually landed.
// ==============================================================================

describe('nightlyRunLogLine states only what the check observed', () => {
  const observed = {
    receiptOutcome: 'VERIFIED' as const,
    scannedRepositories: 4,
    unreachableRepositories: 0,
    reposWithFailingCi: 1,
    plannedSteps: 3,
  };

  it('reports the outcome and counts without a durability caveat when both writes landed', () => {
    const line = nightlyRunLogLine(observed, { recorded: true, auditRecorded: true });
    expect(line).toContain('Nightly Repository Check VERIFIED');
    expect(line).toContain('4 scanned');
    expect(line).toContain('0 unreachable');
    expect(line).toContain('1 with failing CI');
    expect(line).toContain('3 planned step(s)');
    expect(line).not.toContain('NOT written to durable storage');
  });

  it('names a run record that did not reach disk', () => {
    const line = nightlyRunLogLine(observed, { recorded: false, auditRecorded: true });
    expect(line).toContain('run record NOT written to durable storage');
    expect(line).not.toContain('audit row NOT written');
  });

  it('names an audit row that did not reach disk', () => {
    const line = nightlyRunLogLine(observed, { recorded: true, auditRecorded: false });
    expect(line).toContain('audit row NOT written to durable storage');
    expect(line).not.toContain('run record NOT written');
  });

  it('names both when neither durable write landed', () => {
    const line = nightlyRunLogLine(observed, { recorded: false, auditRecorded: false });
    expect(line).toContain('run record NOT written to durable storage');
    expect(line).toContain('audit row NOT written to durable storage');
  });

  it('does not claim a verified check when the receipt is only dispatched', () => {
    const line = nightlyRunLogLine({ ...observed, receiptOutcome: 'DISPATCHED' }, { recorded: true, auditRecorded: true });
    expect(line).toContain('Nightly Repository Check DISPATCHED');
    expect(line).not.toContain('Check VERIFIED');
  });
});

describe('the scheduled nightly tick no longer asserts a start before the scan', () => {
  const serverFlat = fs
    .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
    .replace(/\s+/g, ' ');

  it('drops the pre-scan "Started Nightly Repository Check" line', () => {
    expect(serverFlat).not.toContain('Started Nightly Repository Check');
  });

  it('consumes both durability verdicts in the scheduled tick', () => {
    expect(serverFlat).toContain('const recorded = recordNightlyRun(result.record);');
    expect(serverFlat).toContain('const auditRecorded = addAuditLog(');
  });

  it('logs through nightlyRunLogLine in both the scheduled tick and the manual route', () => {
    const occurrences = serverFlat.split('nightlyRunLogLine(').length - 1;
    // one import + the scheduled tick + the manual route
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
