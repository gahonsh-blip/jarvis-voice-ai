// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/memory` and `POST /api/memory/sync` both answered `success: true`
// for a change that was only held in the process's memory. When the durable
// write failed (read-only volume, full disk), `persistMemory()` returned false
// and the caller ignored it, so a save that never reached disk read as a
// completed one. The rest of the codebase already refuses this pattern —
// `POST /api/autonomous/schedule` and `/api/blueprint/toggle-item` report
// `persisted: false` and roll back — and these routes now match it.
//
// A real server process runs against a memory file made read-only after the
// first successful write, so the failure path is exercised end to end, not
// asserted from source text alone. The source guards pin the wiring so a future
// edit cannot quietly drop the durability check.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4813;
let jarvis: ChildProcess | undefined;
let memoryDir: string;
let memoryFile: string;

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

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

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-durability-'));
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

describe('POST /api/memory reports a durable save honestly', () => {
  it('succeeds and persists a real note while the disk is writable', async () => {
    const res = await fetch(`${base()}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: [{ id: 'n-before', title: 'Before', content: 'writable', createdAt: new Date().toISOString() }],
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    expect(fs.existsSync(memoryFile)).toBe(true);
  });

  it('refuses to report success when the write cannot reach disk', async () => {
    // Make the memory file unwritable. The server process is uid-nonroot, so the
    // next writeFileSync throws EACCES and persistMemory() returns false.
    fs.chmodSync(memoryFile, 0o444);

    const res = await fetch(`${base()}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notes: [{ id: 'n-blocked', title: 'Blocked', content: 'must not be saved', createdAt: new Date().toISOString() }],
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.stored).toBe(false);

    // The rollback must hold: the note that could not be saved is not readable.
    const after = await (await fetch(`${base()}/api/memory`)).json();
    expect(after.notes.map((n: any) => n.title)).not.toContain('Blocked');
    expect(after.notes.map((n: any) => n.title)).toContain('Before');
  });

  it('refuses a sync that cannot reach disk', async () => {
    const res = await fetch(`${base()}/api/memory/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        local: {
          name: '',
          notes: [{ id: 'offline-blocked', title: 'Offline', content: 'must not be saved', createdAt: new Date().toISOString() }],
          customKeyValues: {},
        },
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);

    const after = await (await fetch(`${base()}/api/memory`)).json();
    expect(after.notes.map((n: any) => n.title)).not.toContain('Offline');
  });
});

describe('the memory routes keep the durability check wired', () => {
  const route = (startMarker: string, endMarker: string) => {
    const start = serverSource.indexOf(startMarker);
    return serverSource.slice(start, serverSource.indexOf(endMarker, start));
  };

  const writeRoute = route("app.post('/api/memory'", '// TELEPHONY & AUTONOMOUS VOICE AGENT ENGINE');
  const syncRoute = route("app.post('/api/memory/sync'", "app.post('/api/memory',");

  it('gates the write route on persistMemory() and reports failure otherwise', () => {
    expect(writeRoute).toMatch(/if \(!persistMemory\(\)\)/);
    expect(writeRoute).toMatch(/persisted:\s*false/);
    expect(writeRoute).toMatch(/persisted:\s*true/);
  });

  it('gates the sync route on persistMemory() and reports failure otherwise', () => {
    expect(syncRoute).toMatch(/if \(!persistMemory\(\)\)/);
    expect(syncRoute).toMatch(/persisted:\s*false/);
  });

  it('rolls back the in-memory change when the write fails', () => {
    // Both routes snapshot and restore the pre-change values on failure.
    expect(writeRoute).toMatch(/memoryState\.notes = before\.notes/);
    expect(syncRoute).toMatch(/memoryState\.notes = before\.notes/);
  });
});
