// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// The shared approval registry lives outside `memoryState`, so it only reaches
// disk through `persistApprovalRegistry()`. Two surfaces were wired to it in
// this window:
//   * `POST /api/approvals/create` stages a request and persists the registry.
//     Before the wiring, a request the operator could later approve lived only
//     in the process's memory — a restart silently emptied the queue, so the
//     approval card the operator answered resolved nothing. A write that cannot
//     reach disk must not be reported as a staged approval, and must not stay
//     readable as pending (a restart would drop it anyway).
//   * `POST /api/telephony/outbound/authorize` records a durable decision, and
//     the REJECT branch (like the web REJECT/APPROVE branches) persists the
//     terminal decision so a reboot cannot resurrect it as pending.
//
// A real server process runs against a memory file made read-only after the
// first successful write, and is restarted, so durability is exercised end to
// end rather than asserted from source text alone.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4791;
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
    body: JSON.stringify({ exactAction, target: 'durability.test/target', level: 3 }),
  });
  return { status: res.status, body: await res.json() };
}

async function pendingIds(): Promise<string[]> {
  const { pending } = await (await fetch(`${base()}/api/approvals/pending`)).json();
  return (pending ?? []).map((p: any) => String(p.id));
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-approval-durability-'));
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

describe('POST /api/approvals/create stages durably', () => {
  it('reports a durable staging and the request is readable as pending', async () => {
    const { status, body } = await createApproval('durable-approval-ok');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.staged).toBe(true);
    expect(body.persisted).toBe(true);
    expect(await pendingIds()).toContain(body.request.id);
  });

  it('refuses to claim a staging it could not persist, and rolls the request back', async () => {
    fs.chmodSync(memoryFile, 0o444);

    const { status, body } = await createApproval('durable-approval-must-not-stage');
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.staged).toBe(false);
    expect(body.persisted).toBe(false);

    // The rollback must hold: a request that could not reach disk is not left
    // readable as pending.
    expect(await pendingIds()).not.toContain(body.request.id);
  });
});

describe('the staged approval survives a restart', () => {
  it('reloads the durable request and drops the one that failed to persist', async () => {
    fs.chmodSync(memoryFile, 0o644); // the previous case left the file read-only
    const durable = await createApproval('durable-approval-across-restart');
    expect(durable.body.persisted).toBe(true);

    const failed = await (async () => {
      fs.chmodSync(memoryFile, 0o444);
      const r = await createApproval('durable-approval-dropped-on-restart');
      fs.chmodSync(memoryFile, 0o644);
      return r;
    })();
    expect(failed.status).toBe(500);

    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/approvals/pending`);

    const after = await pendingIds();
    expect(after).toContain(durable.body.request.id);
    expect(after).not.toContain(failed.body.request.id);
  }, 60_000);
});

describe('server.ts persists the approval registry on the decision surfaces', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  it('persists on the create route and rolls back an unpersisted staging', () => {
    const start = serverSource.indexOf("app.post('/api/approvals/create'");
    expect(start).toBeGreaterThan(-1);
    const route = serverSource.slice(start, serverSource.indexOf("app.post('/api/approvals/resolve'", start));
    expect(route).toContain('const persisted = persistApprovalRegistry();');
    expect(route).toContain('hydrateActionRequests(registryBefore);');
  });

  it('persists on both resolve branches and the outbound telephony decision', () => {
    const resolve = serverSource.indexOf("app.post('/api/approvals/resolve'");
    const nextRoute = serverSource.indexOf('app.get(', resolve + 10);
    const resolveBranch = serverSource.slice(resolve, nextRoute);
    // Two branches (REJECT and APPROVE) each persist.
    expect(resolveBranch.match(/persistApprovalRegistry\(\)/g)?.length).toBeGreaterThanOrEqual(2);

    const telephony = serverSource.indexOf("app.post('/api/telephony/outbound/authorize'");
    expect(telephony).toBeGreaterThan(-1);
    const telephonyBranch = serverSource.slice(telephony, telephony + 5000);
    expect(telephonyBranch).toContain('persistApprovalRegistry()');
  });
});
