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
import { nightlyAuditBadge } from '../utils/github/nightlyAuditTruth';

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
