// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `recordNightlyRun()` (`server.ts`) appended a nightly-run history entry and
// called a bare `persistMemory()` whose boolean nobody read. `persistMemory()`
// returns true without writing when the memory file already holds the identical
// bytes, so on a read-only volume or a full disk the run-history row was never
// written while `POST /api/github/nightly/run` answered with the run record and
// no survival signal: the operator saw a nightly run the next boot would not
// have (and `getNightlyRuns()` feeds `/api/github/nightly`, which would then
// silently under-report the runs that actually happened).
//
// `recordNightlyRun()` now reads the record back from disk with
// `nightlyRunOnDisk()`, drops the phantom in-memory row when the write did not
// land, and returns the verdict. The manual-run route reports it as `recorded`.
//
// A real server process runs against a memory file made read-only after the
// first write, so the failure path is exercised end to end without credentials
// (the token is blanked so the scanner reports NOT_CONFIGURED, not a network
// error). Source guards pin the wiring so a future edit cannot drop the check.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4768;
let jarvis: ChildProcess | undefined;
let memoryDir: string;
let memoryFile: string;

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

function startServer(): ChildProcess {
  return spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(JARVIS_PORT),
      JARVIS_MEMORY_FILE: memoryFile,
      // Blank the token so the nightly scan reports NOT_CONFIGURED deterministically
      // instead of calling GitHub (no network in this test, no credential needed).
      GITHUB_TOKEN: '',
      GITHUB_AUTOMATION_TOKEN: '',
    },
    stdio: 'ignore',
  });
}

async function stopServer(): Promise<void> {
  if (!jarvis?.pid) return;
  try {
    process.kill(-jarvis.pid, 'SIGTERM');
  } catch {
    jarvis.kill('SIGTERM');
  }
  await new Promise((r) => setTimeout(r, 1200));
  try {
    process.kill(-jarvis.pid, 'SIGKILL');
  } catch {
    // already gone
  }
  jarvis = undefined;
}

const base = () => `http://127.0.0.1:${JARVIS_PORT}`;

async function runNightly(): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base()}/api/github/nightly/run`, { method: 'POST' });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-nightly-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/memory`);
}, 60_000);

afterAll(async () => {
  await stopServer();
  try {
    fs.chmodSync(memoryFile, 0o644);
  } catch {
    // may not exist
  }
  fs.rmSync(memoryDir, { recursive: true, force: true });
});

describe('POST /api/github/nightly/run reports run-record durability honestly', () => {
  it('reports a durable run record while the disk is writable', async () => {
    const { status, body } = await runNightly();
    // No token is configured, so the check itself is honest FAILED (502) — but
    // the run record it produced really reached disk.
    expect(status).toBe(502);
    expect(body.recorded).toBe(true);
    const onDisk = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    const runIds = (onDisk.nightlyGithubRuns ?? []).map((r: any) => r.runId);
    expect(runIds).toContain(body.record.runId);
  });

  it('reports recorded:false when the run record cannot reach disk', async () => {
    // Make the memory file unwritable. The next writeFileSync throws EACCES, so
    // the durable-write check fails and the run must not be reported as saved.
    fs.chmodSync(memoryFile, 0o444);
    const before = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    const beforeRunIds = (before.nightlyGithubRuns ?? []).map((r: any) => r.runId);

    const { body } = await runNightly();
    expect(body.recorded).toBe(false);
    // The run's audit row is written through the same durable path, so it too
    // must be reported as not recorded rather than presented as logged evidence.
    expect(body.auditRecorded).toBe(false);

    // The phantom row is not left on disk (it never got there) and the response's
    // runId is not present in the durable history.
    const after = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    const afterRunIds = (after.nightlyGithubRuns ?? []).map((r: any) => r.runId);
    expect(afterRunIds).not.toContain(body.record.runId);
    expect(afterRunIds).toEqual(beforeRunIds);
  });
});

describe('the nightly-run history is written through a durable, read-back helper', () => {
  const helper = serverSource.slice(
    serverSource.indexOf('function nightlyRunOnDisk('),
    serverSource.indexOf("app.get('/api/github/status'")
  );
  const route = serverSource.slice(
    serverSource.indexOf("app.post('/api/github/nightly/run'"),
    serverSource.indexOf("app.post('/api/tools/youtube/summarize'")
  );

  it('reads the run record back from disk instead of trusting persistMemory()', () => {
    expect(helper).toContain('if (persistMemory() && nightlyRunOnDisk(record.runId)) return true;');
    expect(helper).toContain('runs.filter((r) => r.runId !== record.runId)');
  });

  it('has the manual-run route consume and report the verdict', () => {
    expect(route).toContain('const runRecorded = recordNightlyRun(result.record);');
    expect(route).toContain('recorded: runRecorded,');
  });

  it('has the manual-run route consume and report the audit-row durability verdict', () => {
    // The audit row is durable evidence of the run; a discarded `addAuditLog()`
    // verdict presented an unlogged run as logged. Guard both the capture and
    // the reported field so a future edit cannot drop the check again.
    expect(route).toContain('const auditRecorded = addAuditLog(');
    expect(route).toContain('auditRecorded,');
  });
});
