// ==============================================================================
// Backlog item 13 — "zero fake success" — approval RESOLUTION durability.
//
// `/api/approvals/resolve` recorded the terminal decision through
// `persistApprovalRegistry()`, which returns `true` when `persistMemory()`
// reports success — and `persistMemory()` returns `true` without writing when
// the file already holds the identical bytes. So a REJECT/APPROVE that could not
// reach disk could still answer `success: true, persisted: true` while the next
// boot resurrected the request as pending. Both branches now read the request's
// terminal status back from disk and, when it is absent, refuse the decision
// (HTTP 500), roll the request back to PENDING_APPROVAL and drop the phantom
// audit row.
//
// A real server process runs against a memory file made read-only after the
// first successful write, so the durability claim is exercised end to end.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4795;
let jarvis: ChildProcess | undefined;
let memoryDir: string;
let memoryFile: string;

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

async function createApproval(exactAction: string) {
  const res = await fetch(`${base()}/api/approvals/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ exactAction, target: 'resolve-durability.test/target', level: 3 }),
  });
  return { status: res.status, body: await res.json() };
}

async function resolveApproval(id: string, decision: 'APPROVE' | 'REJECT') {
  const res = await fetch(`${base()}/api/approvals/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, decision }),
  });
  return { status: res.status, body: await res.json() };
}

async function pendingIds(): Promise<string[]> {
  const { pending } = await (await fetch(`${base()}/api/approvals/pending`)).json();
  return (pending ?? []).map((p: any) => String(p.id));
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-approval-resolve-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/approvals/pending`);
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

describe('POST /api/approvals/resolve — REJECT durability', () => {
  it('refuses a rejection it could not persist and rolls the request back to pending', async () => {
    const created = await createApproval('resolve-durability-reject');
    expect(created.body.persisted).toBe(true);
    const id = created.body.request.id;

    fs.chmodSync(memoryFile, 0o444);
    const { status, body } = await resolveApproval(id, 'REJECT');
    fs.chmodSync(memoryFile, 0o644);

    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    // The rollback must hold: an unpersisted rejection is not reported as a
    // decision, and the request is still readable as pending.
    expect(await pendingIds()).toContain(id);
  });

  it('records a rejection once storage is writable again', async () => {
    const created = await createApproval('resolve-durability-reject-2');
    const id = created.body.request.id;

    const { status, body } = await resolveApproval(id, 'REJECT');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    expect(await pendingIds()).not.toContain(id);
  });
});

describe('POST /api/approvals/resolve — APPROVE durability', () => {
  it('refuses an approval decision it could not persist, reporting the outcome as UNPERSISTED', async () => {
    const created = await createApproval('resolve-durability-approve');
    const id = created.body.request.id;

    fs.chmodSync(memoryFile, 0o444);
    const { status, body } = await resolveApproval(id, 'APPROVE');
    fs.chmodSync(memoryFile, 0o644);

    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.recorded).toBe(false);
    expect(body.outcome).toBe('UNPERSISTED');
    // Rolled back to the pre-decision state so the operator can retry.
    expect(await pendingIds()).toContain(id);
  });

  it('records the approval decision once storage is writable again', async () => {
    const created = await createApproval('resolve-durability-approve-2');
    const id = created.body.request.id;

    const { status, body } = await resolveApproval(id, 'APPROVE');
    expect(status).toBe(200);
    expect(body.persisted).toBe(true);
    expect(await pendingIds()).not.toContain(id);
  });
});

describe('the resolved decision survives a restart', () => {
  it('does not resurrect a recorded rejection as pending after a reboot', async () => {
    const created = await createApproval('resolve-durability-restart');
    const id = created.body.request.id;
    expect((await resolveApproval(id, 'REJECT')).body.persisted).toBe(true);

    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/approvals/pending`);

    expect(await pendingIds()).not.toContain(id);
  }, 60_000);
});

describe('server.ts reads the decision back from disk before claiming durability', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  it('verifies the REJECTED status on disk on the reject branch', () => {
    const start = serverSource.indexOf("app.post('/api/approvals/resolve'");
    const rejectStart = serverSource.indexOf("if (decision === 'REJECT')", start);
    const branch = serverSource.slice(rejectStart, rejectStart + 3000);
    expect(branch).toContain("actionRequestStatusOnDisk(id, 'REJECTED')");
    expect(branch).toContain('status(500)');
  });

  it('verifies the terminal status on disk on the approve branch', () => {
    const start = serverSource.indexOf("app.post('/api/approvals/resolve'");
    const branch = serverSource.slice(start);
    expect(branch).toContain("const terminalStatus = resolution.executed ? 'EXECUTED' : 'FAILED';");
    expect(branch).toContain('actionRequestStatusOnDisk(id, terminalStatus)');
    expect(branch).toContain("outcome: 'UNPERSISTED'");
  });
});
