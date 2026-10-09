// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/restore` merged a backup into the running memory, wrote a
// `VERIFIED` audit row and answered `success: true` without ever checking the
// durable write. `persistMemory()` returned false on an unwritable volume and
// the caller ignored it, so the process held the restored values while the next
// boot read the pre-restore file — a restore that silently reverted on restart.
// The route now rolls the merge back and answers HTTP 500 `success:false`
// `persisted:false`, matching `POST /api/memory` and `POST /api/memory/sync`.
//
// A real server process runs against a memory file made read-only after the
// first successful write, so the failure path is exercised end to end. Source
// guards pin the wiring so a future edit cannot quietly drop the check.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4765;
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

/** A real backup, with `name` set to the value the restore should apply. */
async function backupWithName(name: string): Promise<any> {
  const backup = await (await fetch(`${base()}/api/backup`)).json();
  return { ...backup.backup, data: { ...backup.backup.data, name } };
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-restore-'));
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

describe('POST /api/restore reports a durable restore honestly', () => {
  it('applies a valid restore and reports it persisted while the disk is writable', async () => {
    const res = await fetch(`${base()}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup: await backupWithName('Restored Owner') }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);

    const after = await (await fetch(`${base()}/api/memory`)).json();
    expect(after.name).toBe('Restored Owner');
  });

  it('refuses to report success when the restore cannot reach disk, and rolls back', async () => {
    // Make the memory file unwritable. The server process is uid-nonroot, so the
    // next writeFileSync throws EACCES and persistMemory() returns false.
    fs.chmodSync(memoryFile, 0o444);

    const res = await fetch(`${base()}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup: await backupWithName('Must Not Survive') }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);

    // The rollback must hold: the refused restore is not visible in the running
    // memory, and the durable file still holds the last good value.
    const after = await (await fetch(`${base()}/api/memory`)).json();
    expect(after.name).not.toBe('Must Not Survive');
    expect(after.name).toBe('Restored Owner');
    expect(JSON.parse(fs.readFileSync(memoryFile, 'utf-8')).name).toBe('Restored Owner');
  });

  it('still rejects a malformed backup before touching the disk', async () => {
    const res = await fetch(`${base()}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup: { format: 'not-a-backup', version: 1, data: {} } }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
  });
});

describe('the restore route keeps the durability check wired', () => {
  const route = serverSource.slice(
    serverSource.indexOf("app.post('/api/restore'"),
    serverSource.indexOf('/** Deployment readiness check', serverSource.indexOf("app.post('/api/restore'")),
  );

  it('gates the restore on persistMemory() and reports failure otherwise', () => {
    expect(route).toMatch(/if \(!persistMemory\(\)\)/);
    expect(route).toMatch(/persisted:\s*false/);
    expect(route).toMatch(/persisted:\s*true/);
  });

  it('rolls the merge back when the write fails', () => {
    expect(route).toMatch(/memoryState = before/);
  });

  it('writes the VERIFIED audit row only after a durable restore', () => {
    // The persist check must precede the audit row, so a failed write cannot
    // record a VERIFIED restore that never reached disk.
    expect(route.indexOf('if (!persistMemory())')).toBeLessThan(route.indexOf('addAuditLog('));
  });
});
