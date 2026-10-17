// ==============================================================================
// Backlog item 13 — "zero fake success" — outbound-call AUTHORIZATION durability.
//
// `/api/telephony/outbound/authorize` recorded the decision through
// `persistApprovalRegistry()`, whose boolean is `true` whenever
// `persistMemory()` reports success — and `persistMemory()` returns `true`
// without writing when the file already holds the identical bytes. So an
// authorization that never reached disk answered `persisted: true`, and on the
// APPROVE branch the carrier was dialled anyway: an irreversible call placed on
// a decision the next boot would re-offer for a duplicate dial.
//
// Both branches now read the terminal action status back from disk
// (`actionRequestStatusOnDisk`) and, when it is absent, refuse with HTTP 500
// `success: false, persisted: false, recorded: false, outcome: 'UNPERSISTED'`,
// revert the session request to PENDING_AUTHORIZATION, and roll the action back
// to PENDING_APPROVAL. On APPROVE the dial never runs unless the decision is
// durable.
//
// A real server process runs against a memory file made read-only after the
// first successful write, so the durability claim is exercised end to end.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4799;
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

async function stageOutbound() {
  const res = await fetch(`${base()}/api/telephony/outbound/stage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      destinationNumber: '+919876500099',
      purpose: 'outbound-authorize durability test',
    }),
  });
  return { status: res.status, body: await res.json() };
}

async function authorize(requestId: string, actionId: string | null, decision: 'APPROVE' | 'REJECT') {
  const res = await fetch(`${base()}/api/telephony/outbound/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, actionId, decision }),
  });
  return { status: res.status, body: await res.json() };
}

async function pendingIds(): Promise<string[]> {
  const { pending } = await (await fetch(`${base()}/api/approvals/pending`)).json();
  return (pending ?? []).map((p: any) => String(p.id));
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-outbound-authorize-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/telephony/status`);
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

describe('POST /api/telephony/outbound/authorize — REJECT durability', () => {
  it('refuses a rejection it could not persist, reverts the request and rolls the action back', async () => {
    const staged = await stageOutbound();
    expect(staged.body.success).toBe(true);
    const requestId = staged.body.request.id;
    const actionId = staged.body.actionId;

    fs.chmodSync(memoryFile, 0o444);
    const { status, body } = await authorize(requestId, actionId, 'REJECT');
    fs.chmodSync(memoryFile, 0o644);

    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.recorded).toBe(false);
    expect(body.outcome).toBe('UNPERSISTED');
    // The rollback must hold: the action request is still readable as pending.
    expect(await pendingIds()).toContain(actionId);
  });

  it('records the rejection once storage is writable again', async () => {
    const staged = await stageOutbound();
    const { status, body } = await authorize(staged.body.request.id, staged.body.actionId, 'REJECT');

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.outcome).toBe('REJECTED');
    expect(await pendingIds()).not.toContain(staged.body.actionId);
  });
});

describe('POST /api/telephony/outbound/authorize — APPROVE durability', () => {
  it('refuses an approval it could not persist and never dials the carrier', async () => {
    const staged = await stageOutbound();
    const requestId = staged.body.request.id;
    const actionId = staged.body.actionId;

    fs.chmodSync(memoryFile, 0o444);
    const { status, body } = await authorize(requestId, actionId, 'APPROVE');
    fs.chmodSync(memoryFile, 0o644);

    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.recorded).toBe(false);
    expect(body.outcome).toBe('UNPERSISTED');
    // No carrier dispatch may be reported on an unpersisted authorization.
    expect(body.session).toBeUndefined();
    expect(body.providerCallId).toBeUndefined();
    // Rolled back to pending so the operator can decide again.
    expect(await pendingIds()).toContain(actionId);
  });

  it('proceeds past the durability gate once the approval is writable', async () => {
    const staged = await stageOutbound();
    const { status, body } = await authorize(staged.body.request.id, staged.body.actionId, 'APPROVE');

    // The decision persisted, so the route moves on to the honest dial-engine
    // check (a simulator cannot dial) rather than the durability refusal.
    expect(status).not.toBe(500);
    expect(body.outcome).not.toBe('UNPERSISTED');
    expect(await pendingIds()).not.toContain(staged.body.actionId);
  });
});

describe('server.ts reads the decision back from disk before claiming durability', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  it('verifies the REJECTED status on disk on the reject branch', () => {
    const start = serverSource.indexOf("app.post('/api/telephony/outbound/authorize'");
    const rejectStart = serverSource.indexOf("if (requestedDecision === 'REJECT')", start);
    const branch = serverSource.slice(rejectStart, rejectStart + 2000);
    expect(branch).toContain("actionRequestStatusOnDisk(actionId, 'REJECTED')");
    expect(branch).toContain('status(500)');
    expect(branch).toContain("outcome: 'UNPERSISTED'");
  });

  it('verifies the APPROVED status on disk and reverts on failure on the approve branch', () => {
    const start = serverSource.indexOf("app.post('/api/telephony/outbound/authorize'");
    const branch = serverSource.slice(start);
    expect(branch).toContain("actionRequestStatusOnDisk(actionId, 'APPROVED')");
    expect(branch).toContain("revertOutboundAuthorization(requestId, 'AUTHORIZED')");
    expect(branch).toContain("outcome: 'UNPERSISTED'");
  });
});
