// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/chat` answered the generic (default) branch with "Logged to local
// memory" while calling `persistMemory()` and discarding its return value. When
// the durable write fails (read-only volume, full disk) the transcript lives
// only in the process's memory, so the spoken claim is false — the same class of
// bug already fixed for `set_name` and `create_file` in chatDurabilityTruth.
//
// The branch now leaves a `{{MEMORY_SAVED}}` placeholder where the durability
// claim belongs and swaps in the truthful wording after the transcript write's
// result is known. A real server process runs against a memory file made
// read-only after the first successful write, so the failure path is exercised
// end to end rather than asserted from source text alone.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// server.ts binds a port on import, so the source guard reads the file text,
// matching the convention in chatDurabilityTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const JARVIS_PORT = 4771;
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

// A neutral message that the local intent classifier routes to the generic
// `chat` default branch and that the finance guard does not block.
const NEUTRAL_MESSAGE = 'tell me a story about a lighthouse keeper';

async function chat(message: string) {
  const res = await fetch(`${base()}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-chat-generic-'));
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

describe('item 13 — the generic chat reply does not report a transcript save that failed', () => {
  it('the generic branch gates its durability claim on the persist result', () => {
    // The placeholder replaces the unconditional claim.
    expect(serverFlat).toContain('{{MEMORY_SAVED}}');
    // The transcript write result must be captured, not discarded.
    expect(serverFlat).toContain('replyPersisted = persistMemory();');
    // The discarded-result shape this guard exists to prevent.
    expect(serverFlat).not.toContain('. Logged to local memory. You can ask me to check projects, calculate equations, review weather, or manage social posts.');
  });

  it('claims the local save while the disk is writable', async () => {
    const { status, body } = await chat(NEUTRAL_MESSAGE);
    expect(status).toBe(200);
    expect(body.intent).toBe('chat');
    expect(body.reply).toContain('Logged to local memory');
    expect(body.reply).not.toContain('{{MEMORY_SAVED}}');
  });

  it('does not claim the local save when the write cannot reach disk', async () => {
    fs.chmodSync(memoryFile, 0o444);

    const { status, body } = await chat(NEUTRAL_MESSAGE);
    expect(status).toBe(200);
    expect(body.reply).not.toContain('Logged to local memory');
    expect(body.reply).toContain('could not be written to durable storage, so it was not saved');
    expect(body.reply).not.toContain('{{MEMORY_SAVED}}');
  });
});
