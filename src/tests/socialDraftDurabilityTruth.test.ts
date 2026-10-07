// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/social/generate` staged a local draft into `memoryState.socialPosts`,
// called `persistMemory()` and discarded its return value, wrote a staging audit
// row, and answered `{ success: true, post: newPost }`. On an unwritable volume
// (read-only mount, full disk) the draft lived only in the process's memory while
// the caller was told it had been created — the same durability class already
// fixed for `/api/chat`, `/api/memory`, `/api/restore`, the OAuth disconnect
// routes and the emergency kill switch. The route now checks the persist result,
// rolls the draft back, and answers HTTP 500 `success: false, persisted: false`
// without writing the staging audit row; a durable draft answers
// `persisted: true`.
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

const JARVIS_PORT = 4783;
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

async function generate(topic: string, platform = 'LinkedIn') {
  const res = await fetch(`${base()}/api/social/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, platform }),
  });
  return { status: res.status, body: await res.json() };
}

async function posts(): Promise<any[]> {
  return (await (await fetch(`${base()}/api/social/posts`)).json()).posts;
}

async function auditActions(): Promise<string[]> {
  const security = await (await fetch(`${base()}/api/security`)).json();
  return (security.auditLogs ?? []).map((l: any) => String(l.action ?? ''));
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-social-draft-durability-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/social/posts`);
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

describe('POST /api/social/generate reports a staged draft honestly', () => {
  it('creates and stages the draft while the disk is writable', async () => {
    const topic = 'durable-draft-ok';
    const { status, body } = await generate(topic);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.post.id).toBeTruthy();
    expect(body.post.status).toBe('pending_approval');

    const staged = await posts();
    expect(staged.some((p) => p.topic === topic)).toBe(true);

    const actions = await auditActions();
    expect(actions.some((a) => a.includes(`Staged LinkedIn draft "${topic}"`))).toBe(true);
  });

  it('refuses to claim the draft was created and rolls it back when the write fails', async () => {
    fs.chmodSync(memoryFile, 0o444);

    const topic = 'durable-draft-must-not-save';
    const { status, body } = await generate(topic);
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.error).toContain('durable storage');

    // The rollback must hold: the draft that could not be saved is not readable,
    // and no staging audit row was written for it.
    const staged = await posts();
    expect(staged.some((p) => p.topic === topic)).toBe(false);

    const actions = await auditActions();
    expect(actions.some((a) => a.includes(topic))).toBe(false);
  });
});

describe('POST /api/social/generate is guarded in source against a regression', () => {
  it('checks the persist result before logging or answering success', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    const flat = source.replace(/\s+/g, ' ');
    const route = flat.slice(
      flat.indexOf("app.post('/api/social/generate'"),
      flat.indexOf("app.post('/api/social/action'")
    );
    expect(route).toContain('if (!persistMemory())');
    expect(route).toContain('persisted: true');
    // The unconditional success reply this route used to emit must not return.
    expect(route).not.toContain('res.json({ success: true, post: newPost })');
  });
});
