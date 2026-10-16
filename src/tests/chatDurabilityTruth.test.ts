// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/chat` answered two memory intents with a durability claim that was
// never checked:
//   * `set_name` said "Your identity has been recorded into my primary memory
//     banks" while discarding the `persistMemory()` return value.
//   * `create_file` said "I have saved your note ... this is stored" the same way.
//
// When the durable write fails (read-only volume, full disk) the name or note
// lives only in the process's memory, so the spoken claim is false. The Telegram
// path and `POST /api/memory` already refuse this; the chat route now matches
// them — it reports the failed write and, for a note, rolls the note back.
//
// A real server process runs against a memory file made read-only after the
// first successful write, so the failure path is exercised end to end rather
// than asserted from source text alone.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4767;
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

async function chat(message: string) {
  const res = await fetch(`${base()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-chat-durability-'));
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

describe('POST /api/chat set_name reports a durable record honestly', () => {
  it('records a real name and claims the durable write while the disk is writable', async () => {
    const { status, body } = await chat('My name is Tony Stark');
    expect(status).toBe(200);
    expect(body.actionExecuted).toBe(true);
    expect(body.actionDetail.payload.persisted).toBe(true);
    expect(body.reply).toContain('durable memory banks');

    // The classifier extracts the name from the lowercased text, so the stored
    // identity is lowercased — pre-existing behavior, not part of this change.
    const stored = await (await fetch(`${base()}/api/memory`)).json();
    expect(stored.name).toBe('tony stark');
  });

  it('does not claim the identity was recorded when the write cannot reach disk', async () => {
    fs.chmodSync(memoryFile, 0o444);

    const { status, body } = await chat('My name is Bruce Wayne');
    expect(status).toBe(200);
    expect(body.actionDetail.payload.persisted).toBe(false);
    expect(body.reply).toContain('could not write it to durable storage');
    expect(body.reply).not.toContain('recorded into my durable memory banks');
    // The executed flag must follow the same durable outcome as the reply: a
    // name held only in this process's memory was not recorded, so the case must
    // not advance the user-visible "Autonomous Actions Executed" counter.
    expect(body.actionExecuted).toBe(false);
  });
});

describe('POST /api/chat create_file reports a durable save honestly', () => {
  it('saves a note while the disk is writable', async () => {
    fs.chmodSync(memoryFile, 0o644);

    const { status, body } = await chat('create file my grocery list');
    expect(status).toBe(200);
    expect(body.actionDetail.payload.persisted).toBe(true);
    expect(body.reply).toContain('saved your note');

    const stored = await (await fetch(`${base()}/api/memory`)).json();
    expect(stored.notes.map((n: any) => n.content)).toContain('my grocery list');
  });

  it('refuses to claim a save and rolls the note back when the write fails', async () => {
    fs.chmodSync(memoryFile, 0o444);

    const { status, body } = await chat('create file a note that must not be saved');
    expect(status).toBe(200);
    expect(body.actionDetail.payload.persisted).toBe(false);
    expect(body.reply).toContain('could not write your note to durable storage');
    expect(body.reply).not.toContain('saved your note');

    // The rollback must hold: the note that could not be saved is not readable.
    fs.chmodSync(memoryFile, 0o644);
    const stored = await (await fetch(`${base()}/api/memory`)).json();
    expect(stored.notes.map((n: any) => n.content)).not.toContain('a note that must not be saved');
  });
});
