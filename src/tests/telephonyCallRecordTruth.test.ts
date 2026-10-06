// HERMES JARVIS — telephony call-record ingestion honesty.
//
// `POST /api/telephony/calls` (`server.ts`) answered `success: true` for every
// body that carried an `id` and spread the raw body over the stored record
// (`{ ...existing, ...callData }`). A body naming no real call field, or one
// carrying misspelled/stale keys, read as a saved call record and the junk keys
// were persisted into the history. These tests pin the guard: only real
// `CallRecord` fields are applied, and a write that changes nothing is refused
// instead of being reported as a save.
//
// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in telephonyCallDeleteTruth.test.ts and
// telephonyOwnNumberTruth.test.ts.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyTelephonyCallRecord,
  CALL_RECORD_FIELDS,
} from '../utils/hardening/telephonyCallRecordTruth';

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

describe('classifyTelephonyCallRecord refuses a write that stores nothing', () => {
  it('rejects a body with no id', () => {
    const v = classifyTelephonyCallRecord({ callerName: 'Elena' }, null);
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.reason).toBe('MISSING_ID');
  });

  it('rejects a blank id', () => {
    const v = classifyTelephonyCallRecord({ id: '   ' }, null);
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.reason).toBe('MISSING_ID');
  });

  it('rejects a non-object body', () => {
    const v = classifyTelephonyCallRecord('call_rec_1', null);
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.reason).toBe('NOT_OBJECT');
  });

  it('rejects an id-only body that names no real call field', () => {
    const v = classifyTelephonyCallRecord({ id: 'call_rec_1' }, null);
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.reason).toBe('NO_RECOGNISED_FIELDS');
  });

  it('rejects a body whose keys are all unknown, naming them', () => {
    const v = classifyTelephonyCallRecord({ id: 'call_rec_1', callerNmae: 'typo', dration: 5 }, null);
    expect(v.accepted).toBe(false);
    if (!v.accepted) {
      expect(v.reason).toBe('NO_RECOGNISED_FIELDS');
      expect(v.rejected).toEqual(expect.arrayContaining(['callerNmae', 'dration']));
    }
  });
});

describe('classifyTelephonyCallRecord accepts a real write and drops unknown keys', () => {
  it('creates a new record and keeps only real fields', () => {
    const v = classifyTelephonyCallRecord(
      { id: 'call_rec_9', callerName: 'Elena Rostova', callerNumber: '+1 (212) 555-8941', bogus: 'x' },
      null,
    );
    expect(v.accepted).toBe(true);
    if (v.accepted) {
      expect(v.action).toBe('CREATED');
      expect(v.id).toBe('call_rec_9');
      expect(v.changes).toEqual({ callerName: 'Elena Rostova', callerNumber: '+1 (212) 555-8941' });
      expect(v.changes).not.toHaveProperty('bogus');
      expect(v.rejected).toEqual(['bogus']);
    }
  });

  it('updates a stored record when a real field changes', () => {
    const v = classifyTelephonyCallRecord(
      { id: 'call_rec_9', status: 'ended', durationSeconds: 42 },
      { id: 'call_rec_9', status: 'connected', durationSeconds: 0 },
    );
    expect(v.accepted).toBe(true);
    if (v.accepted) expect(v.action).toBe('UPDATED');
  });

  it('refuses a write that restates the stored record unchanged', () => {
    const v = classifyTelephonyCallRecord(
      { id: 'call_rec_9', status: 'ended', durationSeconds: 42 },
      { id: 'call_rec_9', status: 'ended', durationSeconds: 42 },
    );
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.reason).toBe('UNCHANGED');
  });

  it('treats an array field equal to the stored value as unchanged', () => {
    const v = classifyTelephonyCallRecord(
      { id: 'call_rec_9', spamKeywords: ['solar panel'] },
      { id: 'call_rec_9', spamKeywords: ['solar panel'] },
    );
    expect(v.accepted).toBe(false);
    if (!v.accepted) expect(v.reason).toBe('UNCHANGED');
  });

  it('exposes the real CallRecord field set, not the request keys', () => {
    expect(CALL_RECORD_FIELDS).toContain('callerNumber');
    expect(CALL_RECORD_FIELDS).toContain('transcript');
    expect(CALL_RECORD_FIELDS).not.toContain('bogus');
  });
});

describe('POST /api/telephony/calls reports the real write outcome', () => {
  it('routes the write through classifyTelephonyCallRecord before storing', () => {
    const block = routeBlock('post', '/api/telephony/calls');
    expect(block).toContain('classifyTelephonyCallRecord(callData, existing)');
    expect(block).toContain('if (!verdict.accepted)');
  });

  it('no longer spreads the raw request body over the stored record', () => {
    const block = routeBlock('post', '/api/telephony/calls');
    expect(block).not.toContain('{ ...telephonyCalls[existingIdx], ...callData }');
    expect(block).not.toContain('telephonyCalls.unshift(callData)');
    expect(block).toContain('{ ...existing, ...verdict.changes }');
  });

  it('does not answer success unconditionally with the raw body', () => {
    const block = routeBlock('post', '/api/telephony/calls');
    expect(block).not.toMatch(/res\.json\(\{ success: true, call: callData \}\)/);
    expect(block).toContain('action: verdict.action');
  });
});
