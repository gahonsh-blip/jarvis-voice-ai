// ==============================================================================
// Backlog item 13 — "zero fake success" — Telegram approval callback durability.
//
// `handleTelegramCallback`'s `approve_perm_` / `reject_perm_` branches recorded
// the terminal decision through `persistApprovalRegistry()` and discarded the
// result entirely. That helper returns `true` when `persistMemory()` reports
// success — and `persistMemory()` returns `true` without writing when the file
// already holds the identical bytes. So a tap that could not reach disk still
// told the operator the action was "cancelled safely" or that the approval was
// recorded, while the next boot resurrected the request as pending (and a later
// unrelated persist could write the phantom decision to disk).
//
// The wiring was fixed by commit 42de885 and pinned by source guards in
// `approvalRegistryTerminalTruth.test.ts`. Those guards only read the source
// text; they never exercise the running server. This file adds the missing
// runtime evidence: a real server process against a memory file made read-only
// after the first successful write, so both the durable and non-durable paths
// of each branch are proven end to end.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4821;
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
    body: JSON.stringify({ exactAction, target: 'telegram-callback-durability.test/target', level: 4 }),
  });
  return { status: res.status, body: await res.json() };
}

async function tapCallback(data: string) {
  // No `update_id`: keeps this callback from touching the processed-update
  // marker, which the route also persists.
  const res = await fetch(`${base()}/api/telegram/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query: { id: `cb-${Date.now()}`, data, message: { chat: { id: 999 } } } }),
  });
  return { status: res.status, body: await res.json() };
}

async function pendingIds(): Promise<string[]> {
  const { pending } = await (await fetch(`${base()}/api/approvals/pending`)).json();
  return (pending ?? []).map((p: any) => String(p.id));
}

async function lastBotMessage(): Promise<string> {
  const { messages } = await (await fetch(`${base()}/api/telegram/messages`)).json();
  const botMsgs = (messages ?? []).filter((m: any) => m.sender === 'jarvis_bot');
  return botMsgs.length ? String(botMsgs[botMsgs.length - 1].text) : '';
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-telegram-callback-'));
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

describe('Telegram approve_perm_ — durability truth', () => {
  it('rolls an unpersisted approval back to pending and does not claim it was recorded', async () => {
    const created = await createApproval('telegram-callback-approve-durability');
    expect(created.body.persisted).toBe(true);
    const id = created.body.request.id;

    fs.chmodSync(memoryFile, 0o444);
    const { status, body } = await tapCallback(`approve_perm_${id}`);
    fs.chmodSync(memoryFile, 0o644);

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    // The rollback must hold: an unpersisted approval is not a terminal decision.
    expect(await pendingIds()).toContain(id);
    // The reply must not claim the approval was recorded.
    const reply = await lastBotMessage();
    expect(reply).toContain('could not be written to durable storage');
    expect(reply).not.toContain('APPROVAL RECORDED');
  });

  it('records the approval decision once storage is writable again', async () => {
    const created = await createApproval('telegram-callback-approve-durability-2');
    const id = created.body.request.id;

    await tapCallback(`approve_perm_${id}`);

    expect(await pendingIds()).not.toContain(id);
    const reply = await lastBotMessage();
    expect(reply).toContain('APPROVAL RECORDED');
    // This path never dispatches, so it must never claim the action ran.
    expect(reply).not.toContain('EXECUTED (Verified)');
  });
});

describe('Telegram reject_perm_ — durability truth', () => {
  it('rolls an unpersisted rejection back to pending and does not say it was cancelled', async () => {
    const created = await createApproval('telegram-callback-reject-durability');
    const id = created.body.request.id;

    fs.chmodSync(memoryFile, 0o444);
    await tapCallback(`reject_perm_${id}`);
    fs.chmodSync(memoryFile, 0o644);

    expect(await pendingIds()).toContain(id);
    const reply = await lastBotMessage();
    expect(reply).toContain('could not be written to durable storage');
    expect(reply).not.toContain('cancelled safely');
  });

  it('records a rejection once storage is writable again', async () => {
    const created = await createApproval('telegram-callback-reject-durability-2');
    const id = created.body.request.id;

    await tapCallback(`reject_perm_${id}`);

    expect(await pendingIds()).not.toContain(id);
    const reply = await lastBotMessage();
    expect(reply).toContain('cancelled safely');
  });
});

describe('a decision that could not be written is not resurrected on a later persist', () => {
  it('keeps the rolled-back request pending after another write succeeds', async () => {
    const created = await createApproval('telegram-callback-no-phantom');
    const id = created.body.request.id;

    fs.chmodSync(memoryFile, 0o444);
    await tapCallback(`approve_perm_${id}`);
    fs.chmodSync(memoryFile, 0o644);

    // A later successful persist must not write the phantom decision: the
    // persisted copy was resynced to pending during the rollback.
    await createApproval('telegram-callback-no-phantom-other');
    expect(await pendingIds()).toContain(id);
  });
});

describe('server.ts reads the terminal status back from disk before claiming the decision', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  it('verifies the EXECUTED status on disk on the approve_perm_ branch', () => {
    const branch = serverSource.slice(
      serverSource.indexOf("data.startsWith('approve_perm_')"),
      serverSource.indexOf("data.startsWith('reject_perm_')"),
    );
    expect(branch).toContain("actionRequestStatusOnDisk(permId, 'EXECUTED')");
    // An unrecorded approval must be rolled back to pending, not left terminal.
    expect(branch).toContain("liveReq.status = 'PENDING_APPROVAL'");
  });

  it('verifies the REJECTED status on disk on the reject_perm_ branch', () => {
    const branch = serverSource.slice(serverSource.indexOf("data.startsWith('reject_perm_')"));
    expect(branch).toContain("actionRequestStatusOnDisk(permId, 'REJECTED')");
    expect(branch).toContain("liveReq.status = 'PENDING_APPROVAL'");
  });
});
