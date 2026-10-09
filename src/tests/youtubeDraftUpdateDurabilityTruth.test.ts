// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/social/youtube/update-draft` mutated the staged post's metadata in
// `memoryState.socialPosts`, called `persistMemory()` and discarded its return
// value, then answered `{ success: true, applied: true, post }`. On an
// unwritable volume (read-only mount, full disk) the change lived only in the
// process's memory — the next boot did not have it — while the caller was told
// the draft had been updated. That is the same durability class already fixed
// for `/api/chat`, `/api/memory`, the YouTube staging routes and
// `/api/social/generate`.
//
// The route now snapshots the fields it may touch, writes durably, and on a
// failed write rolls the draft back and answers HTTP 500
// `success: false, applied: false, persisted: false`. A durable update answers
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

const JARVIS_PORT = 4812;
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

async function stageUpload(title: string) {
  const res = await fetch(`${base()}/api/social/youtube/upload-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, privacyStatus: 'private' }),
  });
  return { status: res.status, body: await res.json() };
}

async function updateDraft(postId: string, title: string) {
  const res = await fetch(`${base()}/api/social/youtube/update-draft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId, title, privacyStatus: 'private' }),
  });
  return { status: res.status, body: await res.json() };
}

async function findPost(postId: string): Promise<any> {
  const posts = (await (await fetch(`${base()}/api/social/posts`)).json()).posts;
  return posts.find((p: any) => p.id === postId);
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-youtube-update-durability-'));
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

describe('POST /api/social/youtube/update-draft reports a durable update honestly', () => {
  it('applies a real metadata change while the disk is writable', async () => {
    const staged = await stageUpload('durable-update-base');
    expect(staged.status).toBe(200);
    const postId = staged.body.post.id as string;

    const { status, body } = await updateDraft(postId, 'durable-update-applied');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.applied).toBe(true);
    expect(body.persisted).toBe(true);

    const post = await findPost(postId);
    expect(post.videoTitle).toBe('durable-update-applied');
    expect(post.topic).toBe('durable-update-applied');
  });

  it('refuses to claim the update and rolls the draft back when the write fails', async () => {
    const staged = await stageUpload('durable-update-rollback-base');
    const postId = staged.body.post.id as string;

    fs.chmodSync(memoryFile, 0o444);

    const { status, body } = await updateDraft(postId, 'durable-update-must-not-save');
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.applied).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.error).toContain('durable storage');

    // The failed change must not survive in process memory either — a rollback
    // that left the new title in place would still read as applied.
    const post = await findPost(postId);
    expect(post.videoTitle).toBe('durable-update-rollback-base');
    expect(post.topic).toBe('durable-update-rollback-base');
  });
});

describe('the update-draft route is guarded in source against a regression', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const flat = source.replace(/\s+/g, ' ');

  const routeOf = (start: string, end: string) => {
    const from = flat.indexOf(start);
    const to = flat.indexOf(end);
    expect(from, `route ${start} should be registered`).toBeGreaterThanOrEqual(0);
    return flat.slice(from, to);
  };

  it('checks the persist result before answering success', () => {
    const route = routeOf(
      "app.post('/api/social/youtube/update-draft'",
      'function getLinkedInRedirectUri'
    );
    expect(route).toMatch(/if \(!persistMemory\(\)\)/);
    expect(route).toContain('persisted: false');
    expect(route).toContain('persisted: true');
    // The bare, unguarded `persistMemory();` call this route used to make must
    // not return.
    expect(route).not.toMatch(/[^=] persistMemory\(\);/);
  });
});
