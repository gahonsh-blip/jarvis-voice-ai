// ==============================================================================
// HERMES JARVIS — LOCAL PROJECT HEALTH CHECKS (backlog items 17, 18, 21)
//
// Runs the real lint, test and build commands inside a checkout and reports what
// actually happened: the exit code, the duration, and errors parsed from the
// runner's own output.
//
// Nothing here guesses. A check that never ran is NOT_CONFIGURED, a check that
// could not start is FAILED, and only a completed process yields a pass/fail.
// ==============================================================================

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ExecutionReceipt, buildReceipt, makeEvidence } from '../executionTruth';

export type CheckKind = 'lint' | 'test' | 'build';

export interface CheckOutcome {
  kind: CheckKind;
  command: string;
  /** True only when the process ran to completion with exit code 0. */
  passed: boolean;
  exitCode: number | null;
  durationMs: number;
  stdoutTail: string;
  stderrTail: string;
  /** Set when the process never started, e.g. the script is not defined. */
  notConfiguredReason?: string;
  /** Set when the process was killed for exceeding its timeout. */
  timedOut?: boolean;
  receipt: ExecutionReceipt;
}

export interface ParsedTestSummary {
  filesPassed?: number;
  filesFailed?: number;
  testsPassed?: number;
  testsFailed?: number;
}

export interface ParsedTypeErrors {
  errorCount: number;
  /** file(line,col): error TSxxxx: message */
  errors: Array<{ file: string; line: number; column: number; code: string; message: string }>;
}

export interface LocalHealthReport {
  workspace: string;
  checks: CheckOutcome[];
  lint?: ParsedTypeErrors;
  tests?: ParsedTestSummary;
  /** Build failures reduced to their first meaningful lines. */
  buildErrors: string[];
  allPassed: boolean;
  ranAt: string;
  receipt: ExecutionReceipt;
}

const DEFAULT_CHECK_TIMEOUT_MS = 10 * 60 * 1000;

const CHECK_COMMANDS: Record<CheckKind, { file: string; args: string[] }> = {
  lint: { file: 'npm', args: ['run', '--silent', 'lint'] },
  test: { file: 'npm', args: ['run', '--silent', 'test'] },
  build: { file: 'npm', args: ['run', '--silent', 'build'] },
};

interface RunResult {
  started: boolean;
  startError?: string;
  exitCode: number | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

function runProcess(
  file: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<RunResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const child = spawn(file, args, {
      cwd,
      env: { ...process.env, CI: '1', NO_COLOR: '1', FORCE_COLOR: '0' },
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
    });

    const finish = (exitCode: number | null, started = true, startError?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        started,
        startError,
        exitCode,
        timedOut,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (process.platform !== 'win32' && child.pid) {
          process.kill(-child.pid, 'SIGKILL');
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        child.kill('SIGKILL');
      }
      // Do not wait for 'close': an orphan can hold the pipes open forever.
      finish(null);
    }, timeoutMs);

    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => finish(null, false, err.message));
    child.on('close', (code) => finish(code));
  });
}

function tail(text: string, lines = 40): string {
  const all = text.trimEnd().split('\n');
  return all.slice(-lines).join('\n');
}

/**
 * Parses Vitest's summary output.
 *
 * Returns undefined when the output carries no recognisable counts — an absent
 * summary must never be read as "zero failures".
 */
export function parseVitestOutput(output: string): ParsedTestSummary | undefined {
  const summary: ParsedTestSummary = {};
  const files = output.match(/Test Files\s+(.+)/);
  const tests = output.match(/Tests\s+(.+)/);

  const readCounts = (line: string) => {
    const passed = line.match(/(\d+)\s+passed/);
    const failed = line.match(/(\d+)\s+failed/);
    return {
      passed: passed ? Number(passed[1]) : undefined,
      failed: failed ? Number(failed[1]) : undefined,
    };
  };

  if (files) {
    const { passed, failed } = readCounts(files[1]);
    summary.filesPassed = passed;
    summary.filesFailed = failed;
  }
  if (tests) {
    const { passed, failed } = readCounts(tests[1]);
    summary.testsPassed = passed;
    summary.testsFailed = failed;
  }

  if (
    summary.filesPassed === undefined &&
    summary.filesFailed === undefined &&
    summary.testsPassed === undefined &&
    summary.testsFailed === undefined
  ) {
    return undefined;
  }
  return summary;
}

/** Parses `tsc --noEmit` diagnostics. */
export function parseTypeScriptErrors(output: string): ParsedTypeErrors {
  const errors: ParsedTypeErrors['errors'] = [];
  const pattern = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/gm;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(output)) !== null) {
    errors.push({
      file: match[1],
      line: Number(match[2]),
      column: Number(match[3]),
      code: match[4],
      message: match[5],
    });
  }
  return { errorCount: errors.length, errors };
}

/**
 * Reads the workspace package.json to see whether a check's script exists.
 *
 * Checked up front rather than inferred from npm's stderr, because `npm run
 * --silent` suppresses the "Missing script" message entirely.
 */
export function readDeclaredScripts(workspace: string): {
  ok: boolean;
  scripts: Record<string, string>;
  reason?: string;
} {
  const manifest = path.join(workspace, 'package.json');
  try {
    const raw = fs.readFileSync(manifest, 'utf-8');
    const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
    return { ok: true, scripts: parsed.scripts ?? {} };
  } catch (err) {
    return {
      ok: false,
      scripts: {},
      reason: `No readable package.json at ${manifest}: ${err instanceof Error ? err.message : 'unknown error'}`,
    };
  }
}

/** Detects npm's "Missing script" error, which means the check does not exist. */
export function detectMissingScript(output: string): string | null {
  const match = output.match(/npm error Missing script:\s*"([^"]+)"/);
  return match ? match[1] : null;
}

/** Reduces build output to the lines that explain the failure. */
export function extractBuildErrors(output: string): string[] {
  return output
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /error|failed|ERROR/i.test(l))
    .slice(0, 20);
}

export interface RunHealthChecksOptions {
  workspace: string;
  checks?: CheckKind[];
  timeoutMs?: number;
  /** Injected for tests. */
  runner?: typeof runProcess;
}

/** Runs the requested checks in order and aggregates their real results. */
export async function runHealthChecks(
  options: RunHealthChecksOptions
): Promise<LocalHealthReport> {
  const kinds = options.checks ?? (['lint', 'test', 'build'] as CheckKind[]);
  const timeoutMs = options.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  const runner = options.runner ?? runProcess;
  const ranAt = new Date().toISOString();

  const declared = readDeclaredScripts(options.workspace);
  const outcomes: CheckOutcome[] = [];

  for (const kind of kinds) {
    const spec = CHECK_COMMANDS[kind];
    // The script name is the last argument, after 'run' and '--silent'.
    const scriptName = spec.args[spec.args.length - 1];

    // A script that is not declared cannot run: report that plainly instead of
    // letting npm's non-zero exit look like a failing lint or test.
    if (declared.ok && !(scriptName in declared.scripts)) {
      outcomes.push({
        kind,
        command: `${spec.file} ${spec.args.join(' ')}`,
        passed: false,
        exitCode: null,
        durationMs: 0,
        stdoutTail: '',
        stderrTail: '',
        notConfiguredReason: `package.json defines no "${scriptName}" script, so the ${kind} check cannot run in this workspace.`,
        receipt: buildReceipt({
          action: `github.health.${kind}`,
          target: options.workspace,
          outcome: 'NOT_CONFIGURED',
          detailEn: `package.json defines no "${scriptName}" script, so the ${kind} check could not be run.`,
          detailHi: `package.json में "${scriptName}" स्क्रिप्ट नहीं है, इसलिए ${kind} जाँच नहीं चल सकी।`,
          failureReason: 'CHECK_NOT_CONFIGURED',
        }),
      });
      continue;
    }

    const result = await runner(spec.file, spec.args, options.workspace, timeoutMs);
    const commandText = `${spec.file} ${spec.args.join(' ')}`;
    const combined = `${result.stdout}\n${result.stderr}`;

    if (!result.started) {
      outcomes.push({
        kind,
        command: commandText,
        passed: false,
        exitCode: null,
        durationMs: result.durationMs,
        stdoutTail: tail(result.stdout),
        stderrTail: tail(result.stderr),
        notConfiguredReason: `Could not start the check: ${result.startError}`,
        receipt: buildReceipt({
          action: `github.health.${kind}`,
          target: options.workspace,
          outcome: 'NOT_CONFIGURED',
          detailEn: `The ${kind} check could not be started: ${result.startError}`,
          detailHi: `${kind} जाँच शुरू नहीं हो सकी।`,
          failureReason: result.startError,
        }),
      });
      continue;
    }

    if (result.timedOut) {
      outcomes.push({
        kind,
        command: commandText,
        passed: false,
        exitCode: null,
        durationMs: result.durationMs,
        stdoutTail: tail(result.stdout),
        stderrTail: tail(result.stderr),
        timedOut: true,
        receipt: buildReceipt({
          action: `github.health.${kind}`,
          target: options.workspace,
          outcome: 'FAILED',
          detailEn: `The ${kind} check exceeded ${timeoutMs}ms and was killed.`,
          detailHi: `${kind} जाँच समय-सीमा से अधिक चली और रोक दी गई।`,
          failureReason: 'CHECK_TIMEOUT',
        }),
      });
      continue;
    }

    const passed = result.exitCode === 0;
    const missingScript = detectMissingScript(combined);

    // A missing npm script means the check does not exist in this project. That
    // is not a failing check and it is not a pass: it is not configured.
    if (missingScript) {
      outcomes.push({
        kind,
        command: commandText,
        passed: false,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        stdoutTail: tail(result.stdout),
        stderrTail: tail(result.stderr),
        notConfiguredReason: `package.json has no "${missingScript}" script, so the ${kind} check cannot run here.`,
        receipt: buildReceipt({
          action: `github.health.${kind}`,
          target: options.workspace,
          outcome: 'NOT_CONFIGURED',
          detailEn: `No "${missingScript}" script is defined in package.json, so the ${kind} check could not be run.`,
          detailHi: `package.json में "${missingScript}" स्क्रिप्ट नहीं है, इसलिए ${kind} जाँच नहीं चल सकी।`,
          failureReason: 'CHECK_NOT_CONFIGURED',
        }),
      });
      continue;
    }

    const detail = passed
      ? `The ${kind} check completed successfully (exit 0).`
      : `The ${kind} check exited with code ${result.exitCode}.`;

    outcomes.push({
      kind,
      command: commandText,
      passed,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      stdoutTail: tail(result.stdout),
      stderrTail: tail(result.stderr),
      receipt: buildReceipt({
        action: `github.health.${kind}`,
        target: options.workspace,
        // A real process that ran and produced an exit code is verified evidence.
        outcome: 'VERIFIED',
        detailEn: passed
          ? detail
          : `${detail} ${extractBuildErrors(combined).slice(0, 3).join(' | ')}`.trim(),
        detailHi: passed ? `${kind} जाँच सफल रही।` : `${kind} जाँच विफल रही।`,
        evidence: makeEvidence('os_command', detail, {
          ref: `${commandText} (exit ${result.exitCode})`,
        }),
        failureReason: passed ? undefined : `EXIT_CODE_${result.exitCode}`,
      }),
    });
  }

  const byKind = (k: CheckKind) => outcomes.find((o) => o.kind === k);
  const lintOutcome = byKind('lint');
  const testOutcome = byKind('test');
  const buildOutcome = byKind('build');

  const lint = lintOutcome
    ? parseTypeScriptErrors(`${lintOutcome.stdoutTail}\n${lintOutcome.stderrTail}`)
    : undefined;
  const tests = testOutcome
    ? parseVitestOutput(`${testOutcome.stdoutTail}\n${testOutcome.stderrTail}`)
    : undefined;
  const buildErrors = buildOutcome
    ? extractBuildErrors(`${buildOutcome.stdoutTail}\n${buildOutcome.stderrTail}`)
    : [];

  const allPassed = outcomes.length > 0 && outcomes.every((o) => o.passed);
  const ran = outcomes.filter((o) => o.exitCode !== null).length;

  return {
    workspace: options.workspace,
    checks: outcomes,
    lint,
    tests,
    buildErrors,
    allPassed,
    ranAt,
    receipt: buildReceipt({
      action: 'github.runHealthChecks',
      target: options.workspace,
      outcome: ran === 0 ? 'NOT_CONFIGURED' : 'VERIFIED',
      detailEn:
        ran === 0
          ? 'No health check could be executed in this workspace.'
          : `${ran} check(s) ran: ${outcomes
              .map((o) => `${o.kind}=${o.passed ? 'pass' : 'fail'}`)
              .join(', ')}.`,
      detailHi: `स्वास्थ्य जाँच पूर्ण: ${outcomes.length} जाँचें।`,
      evidence: makeEvidence(
        'os_command',
        `${ran} checks executed in ${options.workspace}`,
        { ref: outcomes.map((o) => o.command).join(' ; ') }
      ),
    }),
  };
}