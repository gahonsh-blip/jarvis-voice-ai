// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/social/youtube/upload-draft` and `POST /api/social/youtube/draft-test`
// staged a draft into `memoryState.socialPosts`, called `persistMemory()` and
// discarded its return value, then answered `{ success: true, post }`. On an
// unwritable volume (read-only mount, full disk) the draft lived only in the
// process's memory while the caller was told it had been staged — the same
// durability class already fixed for `/api/chat`, `/api/memory`, `/api/restore`,
// the OAuth disconnect routes, the emergency kill switch and
// `/api/social/generate`. Each route now checks the persist result, rolls the
// draft and its staging audit row back, and answers HTTP 500
// `success: false, staged: false, persisted: false`; a durable draft answers
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

const JARVIS_PORT = 4801;
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

async function stageTest(title: string) {
  const res = await fetch(`${base()}/api/social/youtube/draft-test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, privacyStatus: 'private' }),
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
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-youtube-draft-durability-'));
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

describe('POST /api/social/youtube/upload-draft reports a staged upload honestly', () => {
  it('stages the upload while the disk is writable', async () => {
    const title = 'durable-upload-ok';
    const { status, body } = await stageUpload(title);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.post.id).toBeTruthy();
    expect(body.post.platform).toBe('YouTube');

    const staged = await posts();
    expect(staged.some((p) => p.topic === title)).toBe(true);
  });

  it('refuses to claim the upload was staged and rolls it back when the write fails', async () => {
    fs.chmodSync(memoryFile, 0o444);

    const title = 'durable-upload-must-not-save';
    const { status, body } = await stageUpload(title);
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.staged).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.error).toContain('durable storage');

    const staged = await posts();
    expect(staged.some((p) => p.topic === title)).toBe(false);

    const actions = await auditActions();
    expect(actions.some((a) => a.includes(title))).toBe(false);
  });
});

describe('POST /api/social/youtube/draft-test reports a staged test draft honestly', () => {
  it('stages the test draft while the disk is writable', async () => {
    fs.chmodSync(memoryFile, 0o644);

    const title = 'durable-test-ok';
    const { status, body } = await stageTest(title);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.post.id).toBeTruthy();
    expect(body.post.platform).toBe('YouTube');

    const staged = await posts();
    expect(staged.some((p) => p.topic === title)).toBe(true);
  });

  it('refuses to claim the test draft was staged and rolls it back when the write fails', async () => {
    fs.chmodSync(memoryFile, 0o444);

    const title = 'durable-test-must-not-save';
    const { status, body } = await stageTest(title);
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.staged).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.error).toContain('durable storage');

    const staged = await posts();
    expect(staged.some((p) => p.topic === title)).toBe(false);

    const actions = await auditActions();
    expect(actions.some((a) => a.includes(title))).toBe(false);
  });
});

describe('YouTube staging routes are guarded in source against a regression', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const flat = source.replace(/\s+/g, ' ');

  const routeOf = (start: string, end: string) => {
    const from = flat.indexOf(start);
    const to = flat.indexOf(end);
    expect(from, `route ${start} should be registered`).toBeGreaterThanOrEqual(0);
    return flat.slice(from, to);
  };

  it.each([
    ["app.post('/api/social/youtube/upload-draft'", "app.post('/api/social/youtube/draft-test'"],
    ["app.post('/api/social/youtube/draft-test'", "app.post('/api/social/youtube/update-draft'"],
  ])('%s checks the persist result before answering success', (start, end) => {
    const route = routeOf(start, end);
    // `persistApprovalRegistry()` is a strict superset of `persistMemory()` — it
    // also writes the Level-3/4 approval queue this route stages into — so either
    // durable write satisfies the guard, but the result must still be checked.
    expect(route).toMatch(/const \w+Persisted = persist\w+\(\)/);
    expect(route).toMatch(/if \(!\w+Persisted\)/);
    expect(route).toContain('persisted: false');
    expect(route).toContain('persisted: true');
    // The bare, unguarded `persistMemory();` call this route used to make must
    // not return.
    expect(route).not.toMatch(/[^=] persistMemory\(\);/);
  });
});
