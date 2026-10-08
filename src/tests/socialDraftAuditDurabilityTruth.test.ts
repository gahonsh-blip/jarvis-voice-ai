// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/social/generate` appended its Level-2 staging audit row *after*
// calling `persistMemory()`, so the row was never serialized into the memory
// file: it lived only in the process's `memoryState.auditLogs` and vanished on
// the next boot, while the route still answered `persisted: true`. The existing
// test read the row back from the same process's `/api/security`, so an
// in-memory row satisfied it and the disk defect went unnoticed.
//
// The route now appends the row *before* the durable write and verifies the row
// is present in the memory file on disk before claiming success. This test
// exercises the real file end to end: the row must be on disk, must survive a
// real restart, and an unwritable volume must be refused with the row rolled
// back.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4794;
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

function auditRowsOnDisk(): any[] {
  return JSON.parse(fs.readFileSync(memoryFile, 'utf-8')).auditLogs ?? [];
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-social-audit-durability-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/security`);
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

describe('POST /api/social/generate writes its staging audit row to disk', () => {
  it('the row is present in the memory file, not only in process memory', async () => {
    const topic = 'audit-durable-on-disk';
    const { status, body } = await generate(topic);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);

    const rows = auditRowsOnDisk();
    expect(rows.some((r) => String(r.action ?? '').includes(`Staged LinkedIn draft "${topic}"`))).toBe(true);
  });

  it('the row survives a real restart', async () => {
    const topic = 'audit-durable-restart';
    expect((await generate(topic)).status).toBe(200);

    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/security`);

    const rows = auditRowsOnDisk();
    expect(rows.some((r) => String(r.action ?? '').includes(topic))).toBe(true);
  });

  it('refuses a staging whose audit row cannot reach disk and rolls it back', async () => {
    fs.chmodSync(memoryFile, 0o444);

    const topic = 'audit-must-not-stage';
    const { status, body } = await generate(topic);
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);

    // Neither the draft nor its staging row may be reported or left behind.
    const posts = (await (await fetch(`${base()}/api/social/posts`)).json()).posts;
    expect(posts.some((p: any) => p.topic === topic)).toBe(false);
    expect((await (await fetch(`${base()}/api/security`)).json()).auditLogs
      .some((l: any) => String(l.action ?? '').includes(topic))).toBe(false);
  });
});

describe('POST /api/social/generate is guarded in source against the ordering regression', () => {
  it('appends the audit row before the durable write and proves it on disk', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    const flat = source.replace(/\s+/g, ' ');
    const route = flat.slice(
      flat.indexOf("app.post('/api/social/generate'"),
      flat.indexOf("app.post('/api/social/action'")
    );
    // The row must be appended before the persist check...
    const pushIndex = route.indexOf('pushAuditEntry({');
    const persistIndex = route.indexOf('if (!persistMemory()');
    expect(pushIndex).toBeGreaterThan(-1);
    expect(persistIndex).toBeGreaterThan(-1);
    expect(pushIndex).toBeLessThan(persistIndex);
    // ...and the check must confirm the row reached disk.
    expect(route).toContain('diskHasAuditRow(auditRow.id)');
  });
});
