// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/autonomous/goals/run` appended its completion audit row, threw
// away `addAuditLog(...)`'s durability verdict, and then called a bare
// `persistMemory()` whose boolean nobody read. On a read-only volume or a full
// disk the write never reaches storage, but the response carried no indication
// of that: the caller was told the run happened with no warning that its audit
// record was not durable. The route now consumes the verdict and reports it as
// `persisted`, so a run whose audit row is not on disk cannot read as recorded.
//
// A real server process runs against a memory file made read-only after the
// first successful write, so the failure path is exercised end to end. Source
// guards pin the wiring so a future edit cannot quietly drop the check.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4766;
let jarvis: ChildProcess | undefined;
let memoryDir: string;
let memoryFile: string;
let stepDir: string;

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
      GEMINI_API_KEY: '',
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

async function runGoal(): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base()}/api/autonomous/goals/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal: 'Durability probe',
      steps: [{ kind: 'fs.mkdir', path: stepDir }],
    }),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-goalrun-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  stepDir = path.join(memoryDir, 'goal-step');
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

describe('POST /api/autonomous/goals/run reports audit durability honestly', () => {
  it('reports a durable audit row while the disk is writable', async () => {
    const { status, body } = await runGoal();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.verified).toBe(true);
    expect(body.persisted).toBe(true);
    expect(fs.existsSync(stepDir)).toBe(true);
  });

  it('reports persisted:false when the completion audit row cannot reach disk', async () => {
    // Make the memory file unwritable. The server process is uid-nonroot, so the
    // next writeFileSync throws EACCES and the durable-write check fails.
    fs.chmodSync(memoryFile, 0o444);

    const { status, body } = await runGoal();
    expect(status).toBe(200);
    // The goal really ran and verified its step — that part is not undone — but
    // the completion audit row is not on disk, and the caller is told so.
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(false);
  });
});

describe('the autonomous goal run route consumes the audit durability verdict', () => {
  const route = serverSource.slice(
    serverSource.indexOf("app.post('/api/autonomous/goals/run'"),
    serverSource.indexOf("app.get('/api/autonomous/goals/step-kinds'"),
  );

  it('captures the audit verdict and reports it', () => {
    expect(route).toContain('const auditPersisted = addAuditLog(');
    expect(route).toContain('persisted: auditPersisted');
  });

  it('no longer discards a bare persistMemory() after the audit row', () => {
    // The old code called `addAuditLog(...); persistMemory();` and ignored both
    // results. The route must not contain a bare `persistMemory();` statement.
    expect(route).not.toMatch(/^\s*persistMemory\(\);\s*$/m);
  });
});
