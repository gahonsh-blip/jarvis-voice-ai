// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `GET /api/backup` validated the backup body and then appended a `VERIFIED`
// audit row, but discarded the write result. `persistMemory()` returns true
// without writing when the file already holds identical bytes (and false when
// the volume is read-only), so on an unwritable volume the route still answered
// `success: true, verified: true` for a backup record that never reached
// `jarvis_memory.json`.
//
// The route now gates on `addAuditLog`'s boolean, which routes through
// `recordDurableAuditRow`: it appends the row, reads that row id back from disk,
// rolls the phantom row back on failure and returns false. When that lands
// false the route answers HTTP 500 `success:false, persisted:false`,
// `verified:false` instead of claiming the backup was recorded.
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

const JARVIS_PORT = 4820;
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
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-backup-'));
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

describe('GET /api/backup reports a durable record honestly', () => {
  it('creates a verified backup and records it while the disk is writable', async () => {
    const res = await fetch(`${base()}/api/backup`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.verified).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.backup.keyCount).toBeGreaterThan(0);
  });

  it('refuses to report success when the record cannot reach disk, and rolls the row back', async () => {
    const countBackupRows = async (): Promise<number> => {
      const security = await (await fetch(`${base()}/api/security`)).json();
      const logs: any[] = Array.isArray(security.auditLogs) ? security.auditLogs : [];
      return logs.filter((l) => String(l?.action || '').includes('Memory backup created')).length;
    };

    // The previous test recorded one durable backup row; the count is the baseline.
    const before = await countBackupRows();
    expect(before).toBe(1);

    // Make the memory file unwritable. The server process is uid-nonroot, so the
    // next writeFileSync throws EACCES and persistMemory() returns false.
    fs.chmodSync(memoryFile, 0o444);

    const res = await fetch(`${base()}/api/backup`);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    expect(body.verified).toBe(false);

    // The refused backup must not append a phantom VERIFIED row to the running
    // memory: the row was rolled back, so the count is unchanged.
    expect(await countBackupRows()).toBe(before);
  });
});

describe('the backup route keeps the durability check wired', () => {
  const route = serverSource.slice(
    serverSource.indexOf("app.get('/api/backup'"),
    serverSource.indexOf("app.post('/api/restore'"),
  );

  it('gates the backup on the durable audit result instead of discarding it', () => {
    expect(route).toMatch(/const recorded = addAuditLog\(/);
    expect(route).toMatch(/if \(!recorded\)/);
    expect(route).toMatch(/persisted:\s*false/);
    expect(route).toMatch(/verified:\s*false/);
  });

  it('reports persisted only on the success path', () => {
    expect(route).toMatch(
      /res\.json\(\{ success: true, verified: true, persisted: true, backup \}\)/,
    );
  });

  it('delegates durability confirmation to a helper that reads the row back from disk', () => {
    const start = serverSource.indexOf('function recordDurableAuditRow');
    const helper = serverSource.slice(start, start + 400);
    expect(helper).toMatch(/diskHasAuditRow\(entry\.id\)/);
    expect(helper).toMatch(/memoryState\.auditLogs = memoryState\.auditLogs\.filter/);
  });
});
