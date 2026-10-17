// ==============================================================================
// Tests for the local health-check runner (backlog items 17, 18, 21).
//
// These run real processes: real `tsc`, real `npm test`, and real failures via
// a script that exits non-zero. Nothing is stubbed, so the parser and the
// honesty rules are exercised against genuine program output.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  parseVitestOutput,
  parseTypeScriptErrors,
  extractBuildErrors,
  runHealthChecks,
} from '../utils/github/localHealth';

describe('parseVitestOutput', () => {
  it('reads the real Vitest summary', () => {
    const output = `
 RUN  v4.1.11

 Test Files  18 passed (18)
      Tests  317 passed (317)
`;
    const parsed = parseVitestOutput(output);
    expect(parsed).toEqual({
      filesPassed: 18,
      filesFailed: undefined,
      testsPassed: 317,
      testsFailed: undefined,
    });
  });

  it('reads failures', () => {
    const output = `
 Test Files  1 failed | 17 passed (18)
      Tests  2 failed | 315 passed (317)
`;
    const parsed = parseVitestOutput(output);
    expect(parsed?.filesFailed).toBe(1);
    expect(parsed?.testsFailed).toBe(2);
    expect(parsed?.testsPassed).toBe(315);
  });

  it('returns undefined when no summary is present', () => {
    // An absent summary must not be read as "zero failures".
    expect(parseVitestOutput('some random output')).toBeUndefined();
  });
});

describe('parseTypeScriptErrors', () => {
  it('extracts diagnostics with file, position and code', () => {
    const output = `server.ts(86,3): error TS2552: Cannot find name 'describeHostScreen'.
src/a.ts(10,5): error TS2322: Type 'string' is not assignable to type 'number'.`;
    const parsed = parseTypeScriptErrors(output);
    expect(parsed.errorCount).toBe(2);
    expect(parsed.errors[0]).toEqual({
      file: 'server.ts',
      line: 86,
      column: 3,
      code: 'TS2552',
      message: "Cannot find name 'describeHostScreen'.",
    });
  });

  it('reports zero errors for clean output', () => {
    const parsed = parseTypeScriptErrors('lint ok\n');
    expect(parsed.errorCount).toBe(0);
  });
});

describe('extractBuildErrors', () => {
  it('keeps only the lines that explain a failure', () => {
    const output = `transforming...\nplain line\nERROR: something broke\nbuilt ok\nbuild failed here`;
    const lines = extractBuildErrors(output);
    expect(lines).toContain('ERROR: something broke');
    expect(lines).toContain('build failed here');
    expect(lines).not.toContain('plain line');
  });
});

describe('runHealthChecks with real processes', () => {
  it('runs a real command and records its genuine exit code', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-pass-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'node -e "console.log(\'Test Files  1 passed (1)\'); console.log(\'Tests  3 passed (3)\')"' } })
    );

    const report = await runHealthChecks({ workspace: tmp, checks: ['test'], timeoutMs: 30_000 });
    const check = report.checks[0];
    expect(check.passed).toBe(true);
    expect(check.exitCode).toBe(0);
    expect(check.durationMs).toBeGreaterThan(0);
    expect(check.receipt.outcome).toBe('VERIFIED');
    expect(report.tests?.testsPassed).toBe(3);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reports a real non-zero exit as a failed check', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-fail-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'node -e "console.error(\'Tests  2 failed (2)\'); process.exit(1)"' } })
    );

    const report = await runHealthChecks({ workspace: tmp, checks: ['test'], timeoutMs: 30_000 });
    const check = report.checks[0];
    expect(check.passed).toBe(false);
    expect(check.exitCode).toBe(1);
    expect(check.receipt.outcome).toBe('VERIFIED');
    expect(check.receipt.failureReason).toBe('EXIT_CODE_1');
    expect(report.allPassed).toBe(false);
    expect(report.tests?.testsFailed).toBe(2);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('reports a missing npm script as NOT_CONFIGURED rather than a pass or a code failure', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-noconfig-'));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'x', scripts: {} }));

    const report = await runHealthChecks({ workspace: tmp, checks: ['lint'], timeoutMs: 30_000 });
    const check = report.checks[0];
    expect(check.passed).toBe(false);
    expect(check.receipt.outcome).toBe('NOT_CONFIGURED');
    expect(check.receipt.failureReason).toBe('CHECK_NOT_CONFIGURED');
    expect(check.notConfiguredReason).toContain('lint');
    expect(report.allPassed).toBe(false);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('kills a hanging check and reports the timeout', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'health-hang-'));
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'x', scripts: { test: 'node -e "setTimeout(()=>{}, 60000)"' } })
    );

    const started = Date.now();
    const report = await runHealthChecks({ workspace: tmp, checks: ['test'], timeoutMs: 2_000 });
    const elapsed = Date.now() - started;
    const check = report.checks[0];

    expect(check.timedOut).toBe(true);
    expect(check.exitCode).toBeNull();
    expect(check.passed).toBe(false);
    expect(check.receipt.outcome).toBe('FAILED');
    expect(check.receipt.failureReason).toBe('CHECK_TIMEOUT');
    // Must not wait for the child's full lifetime.
    expect(elapsed).toBeLessThan(20_000);

    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('runs the real lint check against this repository', async () => {
    const report = await runHealthChecks({ workspace: process.cwd(), checks: ['lint'], timeoutMs: 300_000 });
    const check = report.checks[0];
    expect(check.exitCode).toBe(0);
    expect(check.passed).toBe(true);
    expect(report.lint?.errorCount).toBe(0);
  }, 300_000);
});