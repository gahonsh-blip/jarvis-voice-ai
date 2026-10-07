// ==============================================================================
// Backlog item 13 — "zero fake success" (the Level-4 approval decision path).
//
// `executeApprovedAction` (server.ts) — the shared helper behind
// `POST /api/social/action`, the Telegram `approve_post_*` / `reject_post_*`
// callbacks and the scheduled publish worker — called `persistMemory()` at every
// audit-commit site and discarded the boolean. On an unwritable volume
// (read-only mount, full disk) the human rejection and its audit row lived only
// in the process's memory while the caller was told the decision had been
// recorded. Every site now checks the persist result, rolls its in-memory audit
// row (and, for the non-publish branches, the post snapshot) back, and reports
// `persisted: false`.
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

const JARVIS_PORT = 4772;
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

async function generate(topic: string) {
  const res = await fetch(`${base()}/api/social/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topic, platform: 'LinkedIn' }),
  });
  return (await res.json()).post;
}

async function reject(postId: string) {
  const res = await fetch(`${base()}/api/social/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId, action: 'reject' }),
  });
  return { status: res.status, body: await res.json() };
}

async function auditActions(): Promise<string[]> {
  const security = await (await fetch(`${base()}/api/security`)).json();
  return (security.auditLogs ?? []).map((l: any) => String(l.action ?? ''));
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-social-action-durability-'));
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

describe('POST /api/social/action reports a rejection honestly', () => {
  it('records a rejection while the disk is writable', async () => {
    const post = await generate('action-durable-ok');
    const { body } = await reject(post.id);
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.post.finalTruthState).toBe('REJECTED');

    const actions = await auditActions();
    expect(actions.some((a) => a.includes(`Human Rejected`) && a.includes(post.id))).toBe(true);
  });

  it('refuses to record the rejection and rolls it back when the write fails', async () => {
    const post = await generate('action-must-not-persist');
    fs.chmodSync(memoryFile, 0o444);

    const { body } = await reject(post.id);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    // The post snapshot must be restored: a rejection that was not recorded
    // cannot leave the in-memory draft looking rejected.
    expect(body.post.finalTruthState).toBe('DRAFT');

    const actions = await auditActions();
    expect(actions.some((a) => a.includes(`Human Rejected`) && a.includes(post.id))).toBe(false);
  });
});

describe('executeApprovedAction is guarded in source against a regression', () => {
  it('checks the persist result at every audit-commit site', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    const flat = source.replace(/\s+/g, ' ');
    const helper = flat.slice(
      flat.indexOf('async function executeApprovedAction('),
      flat.indexOf('// 6. REAL TELEGRAM BOT')
    );
    expect(helper).toContain('if (!persistMemory())');
    expect(helper).toContain('rollbackAudit(');
    expect(helper).toContain('persisted: false');
    // The unconditional persist-then-return this helper used to do must not return.
    expect(helper).not.toContain('pushAuditEntry(internalAudit); persistMemory();');
    expect(helper).not.toContain('pushAuditEntry(auditEntry); persistMemory();');
  });
});
