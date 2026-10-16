// HERMES JARVIS — global kill-switch honesty.
//
// `POST /api/system/kill-switch` (`server.ts`) always answered `success: true`
// with "All background processes terminated and queue cleared" and always wrote
// a `🚨 GLOBAL KILL SWITCH TRIGGERED … cleared N pending …` audit row, whatever
// the pre-transition state. Engaging the switch while the system was already
// frozen cleared no queue (there were no PENDING_APPROVAL requests left to
// reject) yet still reported a fresh termination. These tests pin the guard: a
// re-engagement is a no-op, and an unobserved state is never claimed engaged.
//
// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in emergencyTruth/telephonyDispatchTruth tests.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { killSwitchVerdict } from '../utils/emergencyTruth';

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

function routeBlock(method: string, routePath: string): string {
  const needle = `app.${method}('${routePath}'`;
  const start = serverFlat.indexOf(needle);
  expect(start, `route ${method.toUpperCase()} ${routePath} should be registered`).toBeGreaterThanOrEqual(0);
  const next = serverFlat.indexOf('app.', start + needle.length);
  return serverFlat.slice(start, next === -1 ? undefined : next);
}

const ACTIVE = { emergencyPaused: false, hardKillSwitchTriggered: false };
const PAUSED = { emergencyPaused: true, hardKillSwitchTriggered: false };
const LATCHED = { emergencyPaused: false, hardKillSwitchTriggered: true };

describe('killSwitchVerdict reports the real engagement outcome', () => {
  it('reports a fresh engagement of a running system with the cleared count', () => {
    const v = killSwitchVerdict(ACTIVE, 3);
    expect(v.actionExecuted).toBe(true);
    expect(v.outcome).toBe('ENGAGED');
    expect(v.clearedTasksCount).toBe(3);
    expect(v.message).toMatch(/3/);
  });

  it('reports an engagement that cleared no queue without inventing a count', () => {
    const v = killSwitchVerdict(ACTIVE, 0);
    expect(v.actionExecuted).toBe(true);
    expect(v.outcome).toBe('ENGAGED');
    expect(v.message).not.toMatch(/0 queued/);
  });

  it('refuses to call re-engaging an already-paused system a fresh termination', () => {
    const v = killSwitchVerdict(PAUSED, 0);
    expect(v.actionExecuted).toBe(false);
    expect(v.outcome).toBe('ALREADY_ENGAGED');
  });

  it('refuses to call re-engaging a latched hard kill switch a fresh termination', () => {
    const v = killSwitchVerdict(LATCHED, 0);
    expect(v.actionExecuted).toBe(false);
    expect(v.outcome).toBe('ALREADY_ENGAGED');
  });

  it('never claims an unobserved state was engaged', () => {
    for (const pre of [null, undefined, {} as any]) {
      const v = killSwitchVerdict(pre as any, 2);
      expect(v.actionExecuted).toBe(false);
      expect(v.outcome).toBe('UNKNOWN');
    }
  });

  it('treats a non-finite cleared count as nothing cleared', () => {
    for (const n of [NaN, Infinity, -1]) {
      expect(killSwitchVerdict(ACTIVE, n).clearedTasksCount).toBe(0);
    }
  });
});

describe('the kill-switch route uses the engagement verdict', () => {
  const block = routeBlock('post', '/api/system/kill-switch');

  it('derives the verdict from the pre-transition state', () => {
    expect(block).toContain('killSwitchVerdict');
    expect(block).toMatch(/killSwitchVerdict\([^)]*preKillState/);
  });

  it('does not return an unconditional success or a hardcoded termination message', () => {
    expect(block).not.toContain("success: true, message: 'Global Kill Switch engaged");
    expect(block).not.toContain('All background processes terminated and queue cleared.');
  });

  it('gates the audit row and Telegram notice on a real engagement', () => {
    // The row is built only for a real engagement (ternary on the verdict)…
    expect(block).toMatch(/killAuditRow[^=]*= killVerdict\.actionExecuted\s*\? pushAuditEntry/);
    // …and the notice requires the engagement to be durably held.
    expect(block).toMatch(/if \(killVerdict\.actionExecuted && persisted && activeTelegramChatId/);
  });
});
