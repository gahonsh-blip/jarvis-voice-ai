import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Regression guard for backlog item 13. `addAuditLog` built a row with the
// caller's status, pushed it and called `persistMemory()`, discarding the
// boolean. Because `persistMemory()` can return true without writing when the
// file already holds identical bytes, a route could report a VERIFIED audit row
// the next boot does not have. It must now route through the durable writer
// (`recordDurableAuditRow`) and return that verdict. server.ts binds a port on
// import, so the wiring is asserted against the source text, matching
// approvalDecisionTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

function addAuditLogBody(): string {
  const start = serverSource.indexOf('export function addAuditLog(');
  expect(start).toBeGreaterThan(-1);
  const end = serverSource.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return serverSource.slice(start, end);
}

function scheduleRoute(method: 'post' | 'delete'): string {
  const marker = `app.${method}('/api/autonomous/schedule`;
  const start = serverSource.indexOf(marker);
  expect(start, `${marker} missing`).toBeGreaterThan(-1);
  const end = serverSource.indexOf('// Mobile Personal Status', start);
  expect(end, 'next route boundary missing').toBeGreaterThan(start);
  return serverSource.slice(start, end);
}

describe('addAuditLog writes the row durably and returns the verdict', () => {
  it('routes through recordDurableAuditRow instead of a bare persistMemory()', () => {
    const body = addAuditLogBody();
    expect(body).toContain('return recordDurableAuditRow(entry);');
    // The old discarded-boolean write must be gone from this function.
    expect(body).not.toContain('persistMemory();');
  });

  it('declares a boolean return type so callers can gate on durability', () => {
    expect(serverFlat).toContain("approvedBy: string = 'HUMAN_CONFIRMATION', status: string = 'VERIFIED' ): boolean {");
  });
});

describe('the autonomous schedule routes consume the audit durability verdict', () => {
  it('register rolls back and fails when the audit row cannot be written', () => {
    const route = scheduleRoute('post');
    const auditAt = route.indexOf('const auditPersisted = addAuditLog(');
    expect(auditAt).toBeGreaterThan(-1);
    const guardAt = route.indexOf('if (!auditPersisted)');
    expect(guardAt).toBeGreaterThan(auditAt);
    // The success reply comes only after the durability guard.
    const successAt = route.indexOf('res.status(existing >= 0 ? 200 : 201)');
    expect(successAt).toBeGreaterThan(guardAt);
    // The registry entry is rolled back on failure rather than left registered.
    expect(route.slice(guardAt, successAt)).toContain('scheduledGoals.pop()');
  });

  it('delete reports the audit verdict instead of dropping it', () => {
    const route = scheduleRoute('delete');
    expect(route).toContain('const auditRecorded = addAuditLog(');
    expect(route).toContain('res.json({ success: true, persisted: true, auditRecorded, removed: removed.id });');
  });
});
