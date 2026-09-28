// ==============================================================================
// End-to-end tests for AI memory (backlog items 36-39).
//
// A real JARVIS server process runs against a temporary memory file. The test
// drives the real HTTP routes and, for persistence, restarts the server to prove
// state survives — which is the only way to catch the loader bug where emptied
// collections were silently restored from seed data.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4751;
let jarvis: ChildProcess | undefined;
let memoryFile: string;
let memoryDir: string;

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

function startServer(): ChildProcess {
  const child = spawn('npx', ['tsx', 'server.ts'], {
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
  return child;
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

async function saveNote(title: string, content: string) {
  const res = await fetch(`${base()}/api/memory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      notes: [{ id: `n-${title}`, title, content, createdAt: new Date().toISOString() }],
    }),
  });
  return res.json();
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-mem-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/memory`);
}, 60_000);

afterAll(async () => {
  await stopServer();
  fs.rmSync(memoryDir, { recursive: true, force: true });
});

describe('memory persistence through a real server', () => {
  it('survives a restart', async () => {
    await saveNote('Alpha', 'first note');
    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/memory`);

    const body = await (await fetch(`${base()}/api/memory`)).json();
    expect(body.notes.map((n: any) => n.title)).toContain('Alpha');
  });

  it('does not resurrect an intentionally emptied collection', async () => {
    // Empty every collection, restart, and confirm nothing comes back.
    const res = await fetch(`${base()}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: [] }),
    });
    expect((await res.json()).success).toBe(true);

    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/memory`);

    const body = await (await fetch(`${base()}/api/memory`)).json();
    expect(body.notes).toEqual([]);
  });
});

describe('memory sync through a real server', () => {
  it('rejects a sync with no local snapshot', async () => {
    const res = await fetch(`${base()}/api/memory/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('merges an offline note without losing the server copy', async () => {
    await saveNote('Server', 'kept');

    const res = await fetch(`${base()}/api/memory/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local: {
          name: 'Local User',
          notes: [
            {
              id: 'offline-1',
              title: 'Offline',
              content: 'written while offline',
              createdAt: new Date().toISOString(),
            },
          ],
          customKeyValues: {},
        },
      }),
    });
    const body = await res.json();

    expect(body.success).toBe(true);
    const titles = body.merged.notes.map((n: any) => n.title);
    expect(titles).toContain('Offline');
    expect(titles).toContain('Server');
    expect(body.merged.name).toBe('Local User');
  });

  it('reports a conflict instead of overwriting silently', async () => {
    await saveNote('Shared', 'server version');

    const res = await fetch(`${base()}/api/memory/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local: {
          name: '',
          notes: [
            {
              id: 'n-Shared',
              title: 'Shared',
              content: 'local version',
              createdAt: '2026-01-01T00:00:00Z',
              updatedAt: '2026-05-01T00:00:00Z',
            },
          ],
          customKeyValues: {},
        },
      }),
    });
    const body = await res.json();

    expect(body.conflicts.length).toBeGreaterThan(0);
    // Both edits survive; neither is discarded.
    const contents = body.merged.notes.map((n: any) => n.content);
    expect(contents).toContain('local version');
    expect(contents).toContain('server version');
  });
});