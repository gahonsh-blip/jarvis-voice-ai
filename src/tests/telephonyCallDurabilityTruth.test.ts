// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// The telephony call-history routes (`POST /api/telephony/calls`,
// `DELETE /api/telephony/calls`, `DELETE /api/telephony/calls/:id`) mutated the
// module-local `telephonyCalls` array and answered `success: true` /
// `{ ...verdict }` — but the array was never part of `memoryState`, so
// `persistMemory()` serialized it *not at all*. A recorded call, or a deletion,
// silently reverted on the next boot while the caller was told it was saved.
//
// The fix adds `telephonyCallRecords` to `MemoryData`, adds
// `persistTelephonyCalls()` (which copies the live array into `memoryState`
// before the durable write), restores the history on boot, and makes every
// mutating route gate its success on the durable write — rolling back and
// answering HTTP 500 `NOT_PERSISTED` when the write cannot reach disk.
//
// A real server process runs against a temp memory file, is restarted, and is
// made read-only, so durability is exercised end to end.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4793;
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

async function postCall(body: Record<string, unknown>) {
  const res = await fetch(`${base()}/api/telephony/calls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function deleteCall(id: string) {
  const res = await fetch(`${base()}/api/telephony/calls/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return { status: res.status, body: await res.json() };
}

async function clearCalls() {
  const res = await fetch(`${base()}/api/telephony/calls`, { method: 'DELETE' });
  return { status: res.status, body: await res.json() };
}

async function getCalls(): Promise<any[]> {
  return (await (await fetch(`${base()}/api/telephony/calls`)).json()).calls;
}

function storedCallsOnDisk(): any[] {
  return JSON.parse(fs.readFileSync(memoryFile, 'utf-8')).telephonyCallRecords ?? [];
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-telephony-calls-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/telephony/calls`);
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

describe('a recorded call reaches disk before it is reported as saved', () => {
  it('reports a persisted create for a real call record', async () => {
    const res = await postCall({ id: 'call-dur-1', callerNumber: '+91000', status: 'completed' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.persisted).toBe(true);
    expect(res.body.action).toBe('CREATED');
  });

  it('writes the record into the memory file on disk', () => {
    const ids = storedCallsOnDisk().map((c) => c.id);
    expect(ids).toContain('call-dur-1');
  });

  it('serves the recorded call back from the live history', async () => {
    expect((await getCalls()).map((c) => c.id)).toContain('call-dur-1');
  });
});

describe('the recorded call survives a restart', () => {
  it('restores the call written before the restart', async () => {
    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/telephony/calls`);

    expect((await getCalls()).map((c) => c.id)).toContain('call-dur-1');
  }, 60_000);
});

describe('call-history deletion is honest and durable', () => {
  it('refuses to call deleting an unknown id a success', async () => {
    const res = await deleteCall('never-recorded');
    expect(res.body.success).toBe(false);
    expect(res.body.outcome).toBe('NOT_FOUND');
    expect(res.body.persisted).toBeUndefined();
  });

  it('reports a persisted delete for a recorded call and removes it from disk', async () => {
    const res = await deleteCall('call-dur-1');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.persisted).toBe(true);
    expect(res.body.removed).toBe(1);

    expect((await getCalls()).map((c) => c.id)).not.toContain('call-dur-1');
    expect(storedCallsOnDisk().map((c) => c.id)).not.toContain('call-dur-1');
  });

  it('refuses to call clearing an empty history a success', async () => {
    const res = await clearCalls();
    expect(res.body.success).toBe(false);
    expect(res.body.outcome).toBe('NOTHING_TO_CLEAR');
    expect(res.body.persisted).toBeUndefined();
  });
});

describe('an unpersistable call write is refused, not faked', () => {
  it('answers 500 and does not claim the call when the disk write fails', async () => {
    // Seed one record while the volume is writable so the clear/delete path has
    // something real to lose.
    const seed = await postCall({ id: 'call-dur-2', callerNumber: '+91001', status: 'completed' });
    expect(seed.body.persisted).toBe(true);

    fs.chmodSync(memoryFile, 0o444);

    const create = await postCall({ id: 'call-dur-3', callerNumber: '+91002', status: 'completed' });
    expect(create.status).toBe(500);
    expect(create.body.success).toBe(false);
    expect(create.body.persisted).toBe(false);
    expect(create.body.outcome).toBe('NOT_PERSISTED');
    expect((await getCalls()).map((c) => c.id)).not.toContain('call-dur-3');

    const del = await deleteCall('call-dur-2');
    expect(del.status).toBe(500);
    expect(del.body.success).toBe(false);
    expect(del.body.persisted).toBe(false);
    expect(del.body.outcome).toBe('NOT_PERSISTED');
    // The rollback must hold: the record the write could not remove is still
    // readable, and still on disk.
    expect((await getCalls()).map((c) => c.id)).toContain('call-dur-2');
    expect(storedCallsOnDisk().map((c) => c.id)).toContain('call-dur-2');

    fs.chmodSync(memoryFile, 0o644);
  });
});

describe('server.ts wires the call routes and boot path to durable storage', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  it('persists the history in the call mutations and restores it on boot', () => {
    expect(serverSource).toContain('function persistTelephonyCalls()');
    expect(serverSource).toContain('memoryState.telephonyCallRecords = telephonyCalls;');
    expect(serverSource).toContain('if (!persistTelephonyCalls())');
  });
});
