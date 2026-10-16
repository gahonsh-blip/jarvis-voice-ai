// HERMES JARVIS — telephony test-suite route honesty (backlog item 13).
//
// `GET /api/telephony/test-suite` used to answer `success: true` for every run
// that returned a summary, so a run with failing cases was reported to the
// caller as a success. The route now derives its verdict from the run via
// `classifyTelephonySuiteRun`.
//
// The unit cases pin the mapping (a failing run and an empty run must both be
// `success: false`); the source guards prove the route delegates to the helper
// instead of asserting success itself.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyTelephonySuiteRun } from '../utils/hardening/telephonySuiteTruth';

const SERVER_SRC = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf-8');

describe('classifyTelephonySuiteRun never claims a pass a run did not earn', () => {
  it('reports PASSED and success only for a positive, fully green run', () => {
    const v = classifyTelephonySuiteRun({ total: 20, passed: 20, failed: 0 });
    expect(v.success).toBe(true);
    expect(v.outcome).toBe('PASSED');
    expect(v.message).toContain('20');
  });

  it('reports FAILED and success:false when any case failed', () => {
    const v = classifyTelephonySuiteRun({ total: 20, passed: 19, failed: 1 });
    expect(v.success).toBe(false);
    expect(v.outcome).toBe('FAILED');
    expect(v.message).toContain('1');
  });

  it('reports EMPTY and success:false when no case ran', () => {
    const v = classifyTelephonySuiteRun({ total: 0, passed: 0, failed: 0 });
    expect(v.success).toBe(false);
    expect(v.outcome).toBe('EMPTY');
  });

  it('reports EMPTY and success:false for a missing or malformed summary', () => {
    expect(classifyTelephonySuiteRun(null).success).toBe(false);
    expect(classifyTelephonySuiteRun(null).outcome).toBe('EMPTY');
    expect(classifyTelephonySuiteRun(undefined).success).toBe(false);
    expect(
      classifyTelephonySuiteRun({ total: NaN, passed: 0, failed: 0 } as never).outcome,
    ).toBe('EMPTY');
  });
});

describe('the test-suite route derives success from the run', () => {
  it('delegates to classifyTelephonySuiteRun', () => {
    expect(SERVER_SRC).toContain('classifyTelephonySuiteRun(summary)');
  });

  it('no longer answers success:true unconditionally for a summary', () => {
    expect(SERVER_SRC).not.toMatch(/res\.json\(\{\s*success:\s*true,\s*summary\s*\}\)/);
  });
});
