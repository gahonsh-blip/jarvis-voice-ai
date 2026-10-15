// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/restore` already refuses a restore that cannot reach disk. The
// `VERIFIED` audit row it appends next is a second durable write through
// `addAuditLog()`, whose boolean was discarded: a restore applied durably but
// whose security record never reached `jarvis_memory.json` still answered an
// unqualified `success: true`, hiding the missing audit trail for a Level-4
// destructive operation.
//
// The route now captures that boolean, returns it as `auditRecorded`, and names
// the gap via `restoreAuditNote`. The helper is exercised directly, the wiring
// is pinned by a source guard, and the real server process is checked to confirm
// a durable restore reports the audit row as recorded.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { restoreAuditNote } from '../utils/hardening/restoreAuditDurabilityTruth';

const JARVIS_PORT = 4766;
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

const base = () => `http://127.0.0.1:${JARVIS_PORT}`;

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-restore-audit-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = spawn('npx', ['tsx', 'server.ts'], {
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
  await waitForServer(`${base()}/api/memory`);
}, 60_000);

afterAll(async () => {
  if (jarvis?.pid) {
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
  try {
    fs.chmodSync(memoryFile, 0o644);
  } catch {
    // may not exist
  }
  fs.rmSync(memoryDir, { recursive: true, force: true });
});

describe('restoreAuditNote names the unrecorded audit row only when it is missing', () => {
  it('returns an empty string when the audit row reached disk', () => {
    expect(restoreAuditNote(true)).toBe('');
  });

  it('names the missing security audit entry without calling the restore a failure', () => {
    const note = restoreAuditNote(false);
    expect(note).toContain('security audit entry');
    expect(note).toContain('could not be written to durable storage');
    expect(note).toContain('The restore is real');
    // It must not claim the restore itself failed.
    expect(note).not.toMatch(/restore (failed|was not applied)/i);
  });
});

describe('POST /api/restore reports the audit row honestly', () => {
  it('reports auditRecorded true when the restore and its audit row are both durable', async () => {
    const backup = await (await fetch(`${base()}/api/backup`)).json();
    const payload = { ...backup.backup, data: { ...backup.backup.data, name: 'Audit Path Owner' } };

    const res = await fetch(`${base()}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup: payload }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    // The row was written and read back from disk, so the note is absent.
    expect(body.auditRecorded).toBe(true);
    expect(body.auditNote).toBeUndefined();

    // The row must actually be in the durable file, not only in memory.
    const onDisk = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    expect(
      (onDisk.auditLogs || []).some((e: any) => /Memory restored from backup/.test(e.action)),
    ).toBe(true);
  });
});

describe('the restore route keeps the audit durability check wired', () => {
  const route = serverSource.slice(
    serverSource.indexOf("app.post('/api/restore'"),
    serverSource.indexOf('/** Deployment readiness check', serverSource.indexOf("app.post('/api/restore'")),
  );

  it('captures the addAuditLog verdict instead of discarding it', () => {
    expect(route).toMatch(/const auditRecorded = addAuditLog\(/);
    expect(route).toMatch(/restoreAuditNote\(auditRecorded\)/);
    expect(route).toMatch(/auditRecorded,/);
  });

  it('still gates the restore itself on persistMemory() before the audit row', () => {
    expect(route.indexOf('if (!persistMemory())')).toBeLessThan(route.indexOf('addAuditLog('));
  });
});
