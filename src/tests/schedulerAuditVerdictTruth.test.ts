// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `addAuditLog()` returns the real verdict of the durable audit write: `true`
// only once the row is read back from disk, `false` when the write was refused
// (read-only volume, full disk) and the phantom row dropped. The scheduler tick
// discarded that boolean at eleven call sites, so a tick whose audit row never
// reached disk still passed as a recorded run — the security matrix would show
// the failure line missing while the log claimed it happened.
//
// This test pins the fix at the source level: every `addAuditLog(...)` call
// inside `checkAndRunSchedulerJobs` must have its verdict captured in a binding
// and acted on. server.ts binds a port on import, so the assertion reads the
// source text, matching the convention in actionExecutedSweepAudit.test.ts.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

/** The body of `checkAndRunSchedulerJobs`, the scheduler tick under audit. */
function schedulerTickBody(): string {
  const start = serverSrc.indexOf('async function checkAndRunSchedulerJobs()');
  expect(start).toBeGreaterThan(-1);
  const end = serverSrc.indexOf('\n}\n', start);
  expect(end).toBeGreaterThan(start);
  return serverSrc.slice(start, end);
}

describe('scheduler ticks report the real verdict of their audit write (item 13)', () => {
  const body = schedulerTickBody();

  it('every addAuditLog() call in the scheduler tick captures its boolean', () => {
    // A captured call is preceded by `= ` (the binding); a discarded call is a
    // bare statement whose preceding non-whitespace character is not `=`.
    const discarded = [...body.matchAll(/addAuditLog\(/g)].filter((m) => {
      const before = body.slice(Math.max(0, (m.index ?? 0) - 30), m.index ?? 0);
      return !/=\s*$/.test(before);
    });
    expect(discarded.map((m) => body.slice(m.index ?? 0, (m.index ?? 0) + 60))).toEqual([]);
  });

  it('each captured audit verdict is used, never left dangling', () => {
    const bindings = [...body.matchAll(/const (\w+) = addAuditLog\(/g)].map((m) => m[1]);
    // 11 sites that used to discard the verdict, plus the pre-existing
    // `auditRecorded` for the GitHub nightly check.
    expect(bindings.length).toBe(12);
    for (const name of bindings) {
      // The binding is used when its name appears again after the declaration:
      // either as `if (!name)` or passed to a consumer such as the nightly run
      // log line. A verdict assigned and never read is the discarded shape.
      const uses = [...body.matchAll(new RegExp(`\\b${name}\\b`, 'g'))].length;
      expect(uses, `${name} verdict is assigned but never read`).toBeGreaterThan(1);
    }
  });

  it('the discarded-verdict sites are gone', () => {
    // The pre-fix shape: a bare `addAuditLog(` statement with no binding.
    expect(body).not.toMatch(/^\s*addAuditLog\(/m);
  });
});
