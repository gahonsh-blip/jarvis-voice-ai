// ==============================================================================
// Backlog item 13 — "zero fake success" — filesystem audit-row durability.
//
// `/api/tools/fs/write` and `/api/tools/fs/delete` recorded a VERIFIED audit row
// through `persistMemory()`, which returns `true` without writing when the file
// already holds identical bytes. A dropped write therefore answered success
// while the audit row naming the file change was never on disk — the running
// process claimed history the next boot would not have. Both routes now append
// through `recordDurableAuditRow`, read the row back from disk with
// `diskHasAuditRow`, roll a phantom row back, and report `auditPersisted:false`
// with an explanatory error instead of claiming a durable record.
//
// A real server process runs against a memory file made read-only after the
// first successful write, so the durability claim is exercised end to end.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4831;
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

/** Audit rows currently on disk, read directly from the memory file. */
function diskAuditRows(): any[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    return Array.isArray(parsed.auditLogs) ? parsed.auditLogs : [];
  } catch {
    return [];
  }
}

/** True when an audit row whose action contains `needle` is present on disk. */
function diskHasAction(needle: string): boolean {
  return diskAuditRows().some((r) => typeof r?.action === 'string' && r.action.includes(needle));
}

async function fsWrite(filePath: string, content: string) {
  const res = await fetch(`${base()}/api/tools/fs/write`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath, content }),
  });
  return { status: res.status, body: await res.json() };
}

async function fsDelete(filePath: string) {
  const res = await fetch(`${base()}/api/tools/fs/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath }),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-fs-audit-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/approvals/pending`);
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

describe('POST /api/tools/fs/write — audit durability', () => {
  it('records the file write and reports the audit row as persisted', async () => {
    const name = 'hermes_fs_audit_ok.tmp';
    const { status, body } = await fsWrite(name, 'hello');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.auditPersisted).toBe(true);
    expect(body.auditRecorded).toBe(true);
    // The row must actually be on disk, not merely claimed.
    expect(diskHasAction(`Modified Workspace File: "${name}"`)).toBe(true);
    fs.rmSync(path.join(process.cwd(), name), { force: true });
  });

  it('refuses to claim a durable audit row when the write could not be persisted', async () => {
    const name = 'hermes_fs_audit_unpersisted.tmp';
    fs.chmodSync(memoryFile, 0o444);
    const { status, body } = await fsWrite(name, 'hello');
    fs.chmodSync(memoryFile, 0o644);

    expect(status).toBe(200);
    // The file itself was written, but the audit row is not durable and the
    // response must say so rather than reporting a VERIFIED record.
    expect(body.success).toBe(true);
    expect(body.auditPersisted).toBe(false);
    expect(body.auditRecorded).toBe(false);
    expect(body.error).toContain('audit record could not be persisted');
    expect(diskHasAction(`Modified Workspace File: "${name}"`)).toBe(false);
    fs.rmSync(path.join(process.cwd(), name), { force: true });
  });
});

describe('POST /api/tools/fs/delete — audit durability', () => {
  it('records the deletion and reports the audit row as persisted', async () => {
    const name = 'hermes_fs_audit_delete_ok.tmp';
    await fsWrite(name, 'to-delete');
    const { status, body } = await fsDelete(name);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.auditPersisted).toBe(true);
    expect(diskHasAction(`Deleted Workspace Resource: "${name}"`)).toBe(true);
  });

  it('refuses to claim a durable audit row when the deletion record could not be persisted', async () => {
    const name = 'hermes_fs_audit_delete_unpersisted.tmp';
    await fsWrite(name, 'to-delete');
    fs.chmodSync(memoryFile, 0o444);
    const { status, body } = await fsDelete(name);
    fs.chmodSync(memoryFile, 0o644);

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.auditPersisted).toBe(false);
    expect(body.auditRecorded).toBe(false);
    expect(body.error).toContain('audit record could not be persisted');
    expect(diskHasAction(`Deleted Workspace Resource: "${name}"`)).toBe(false);
  });
});

describe('server.ts reads the audit row back from disk before claiming durability', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  it('routes fs write and delete through recordDurableAuditRow', () => {
    const writeStart = serverSource.indexOf("app.post('/api/tools/fs/write'");
    const deleteStart = serverSource.indexOf("app.post('/api/tools/fs/delete'");
    expect(writeStart).toBeGreaterThan(-1);
    expect(deleteStart).toBeGreaterThan(writeStart);
    expect(serverSource.slice(writeStart, deleteStart)).toContain('recordDurableAuditRow');
    expect(serverSource.slice(deleteStart, deleteStart + 1800)).toContain('recordDurableAuditRow');
  });

  it('defines recordDurableAuditRow to verify the row on disk and roll it back on failure', () => {
    const start = serverSource.indexOf('function recordDurableAuditRow');
    expect(start).toBeGreaterThan(-1);
    const body = serverSource.slice(start, start + 500);
    expect(body).toContain('diskHasAuditRow(entry.id)');
    expect(body).toContain('memoryState.auditLogs = memoryState.auditLogs.filter');
  });
});
