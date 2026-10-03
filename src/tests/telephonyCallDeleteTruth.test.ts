// HERMES JARVIS — telephony call-history deletion honesty.
//
// `DELETE /api/telephony/calls` and `DELETE /api/telephony/calls/:id`
// (`server.ts`) both answered `success: true` unconditionally, so clearing an
// already-empty history — or deleting an id that was never recorded — still
// read as a completed deletion. The route asserted that call records were
// removed while the in-memory store was unchanged. These tests pin the guard:
// a deletion reports success only when the store actually lost a record, and a
// no-op names the honest outcome without claiming a removal.
//
// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in oauthDisconnectTruth.test.ts and
// telephonyDispatchTruth.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyTelephonyCallDeletion } from '../utils/hardening/telephonyCallDeleteTruth';

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

/** Extracts one route handler's source up to the next app.<method> registration. */
function routeBlock(method: string, routePath: string): string {
  const needle = `app.${method}('${routePath}'`;
  const start = serverFlat.indexOf(needle);
  expect(start, `route ${method.toUpperCase()} ${routePath} should be registered`).toBeGreaterThanOrEqual(0);
  const next = serverFlat.indexOf('app.', start + needle.length);
  return serverFlat.slice(start, next === -1 ? undefined : next);
}

describe('classifyTelephonyCallDeletion reports the real outcome', () => {
  it('reports a real clear of a non-empty history as success with the count', () => {
    const v = classifyTelephonyCallDeletion(3);
    expect(v.success).toBe(true);
    expect(v.removed).toBe(3);
    expect(v.outcome).toBe('DELETED');
    expect(v.message).toMatch(/3/);
  });

  it('refuses to call clearing an empty history a success', () => {
    const v = classifyTelephonyCallDeletion(0);
    expect(v.success).toBe(false);
    expect(v.outcome).toBe('NOTHING_TO_CLEAR');
  });

  it('reports a deleted existing call as success', () => {
    const v = classifyTelephonyCallDeletion(1, 'call-42');
    expect(v.success).toBe(true);
    expect(v.removed).toBe(1);
    expect(v.message).toMatch(/call-42/);
  });

  it('refuses to call deleting an unknown id a success and names the id', () => {
    const v = classifyTelephonyCallDeletion(0, 'missing-call');
    expect(v.success).toBe(false);
    expect(v.outcome).toBe('NOT_FOUND');
    expect(v.message).toMatch(/missing-call/);
  });

  it('treats a non-finite removed count as nothing removed', () => {
    for (const removed of [NaN, -1, Infinity]) {
      const v = classifyTelephonyCallDeletion(removed);
      expect(v.success).toBe(false);
    }
  });
});

describe('the telephony delete routes use the deletion verdict', () => {
  it('the clear route no longer hardcodes success and calls the classifier', () => {
    const block = routeBlock('delete', '/api/telephony/calls');
    expect(block).toContain('classifyTelephonyCallDeletion');
    expect(block).not.toContain("success: true, message: 'Telephony call history cleared'");
    expect(block).not.toContain("message: 'Telephony call history cleared'");
  });

  it('the delete-by-id route no longer hardcodes success and calls the classifier', () => {
    const block = routeBlock('delete', '/api/telephony/calls/:id');
    expect(block).toContain('classifyTelephonyCallDeletion');
    expect(block).not.toContain('Call ${id} deleted');
    // The classifier must be reached with the id so an unremoved id is
    // reported NOT_FOUND rather than a bare success.
    expect(block).toMatch(/classifyTelephonyCallDeletion\([^)]*id[^)]*\)/);
  });

  it('no telephony delete route returns an unconditional success literal', () => {
    for (const route of ['/api/telephony/calls', '/api/telephony/calls/:id']) {
      const block = routeBlock('delete', route);
      expect(block).not.toContain('res.json({ success: true');
    }
  });
});
