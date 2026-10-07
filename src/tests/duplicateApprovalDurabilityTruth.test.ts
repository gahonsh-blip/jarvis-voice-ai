// ==============================================================================
// Backlog item 13 — "zero fake success" (the duplicate-approval branch of the
// Level-4 decision path).
//
// `executeApprovedAction` (server.ts) refuses to re-publish an already published
// and verified post. That refusal is recorded as a `Duplicate Approval Blocked`
// audit row and returned as `auditEntry`, and the caller acted on it:
// `POST /api/social/action` echoes `auditEntry`, and the Telegram
// `approve_post_*` callback prints `result.auditEntry.id` as the confirmed audit
// log ID. The branch built the row, but called no persist and answered
// `persisted: true` — so the row never reached disk, the "Audit Log ID" named a
// record absent from the log, and the refusal was gone on restart.
//
// A real server process runs against a seeded memory file, so the branch is
// exercised end to end rather than asserted from source text alone: a writable
// disk records the block, and a file made read-only after the first write proves
// the block is refused and not reported as recorded.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4773;
const SEED_POST_ID = 'seed-published-1';
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

async function approveDuplicate(postId: string) {
  const res = await fetch(`${base()}/api/social/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postId, action: 'approve_and_publish' }),
  });
  return { status: res.status, body: await res.json() };
}

async function auditLogs(): Promise<Array<{ id: string; action: string }>> {
  const security = await (await fetch(`${base()}/api/security`)).json();
  return (security.auditLogs ?? []).map((l: any) => ({ id: String(l.id), action: String(l.action ?? '') }));
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-dup-approval-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  // Seed a post that is already published and verified, so the next approval
  // hits the duplicate-refusal branch.
  fs.writeFileSync(
    memoryFile,
    JSON.stringify({
      socialPosts: [
        {
          id: SEED_POST_ID,
          platform: 'LinkedIn',
          topic: 'seed',
          content: 'seed content',
          hashtags: [],
          creativePrompt: '',
          status: 'published',
          executionStatus: 'SUCCESS',
          verificationStatus: 'VERIFIED',
          finalTruthState: 'VERIFIED',
          providerUrn: 'urn:li:share:SEED1',
        },
      ],
      auditLogs: [],
    })
  );
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

describe('executeApprovedAction records a duplicate-approval block honestly', () => {
  it('records the block, and the returned audit id is really in the log, while the disk is writable', async () => {
    const { body } = await approveDuplicate(SEED_POST_ID);
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    expect(String(body.auditEntry.action)).toContain('Duplicate Approval Blocked');
    expect(String(body.auditEntry.action)).toContain(SEED_POST_ID);

    const logs = await auditLogs();
    const recorded = logs.find((l) => l.id === body.auditEntry.id);
    expect(recorded).toBeTruthy();
    expect(recorded!.action).toContain('Duplicate Approval Blocked');
  });

  it('refuses to report the block as recorded when the write fails', async () => {
    fs.chmodSync(memoryFile, 0o444);

    const { body } = await approveDuplicate(SEED_POST_ID);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    expect(String(body.auditEntry.errorReason)).toContain('could not be written to durable storage');

    // The block was reported as not recorded, so its row must not be visible
    // either — a row that only lives in memory would imply a durable record.
    const logs = await auditLogs();
    expect(logs.some((l) => l.id === body.auditEntry.id)).toBe(false);
  });
});

describe('the duplicate-approval branch is guarded in source against a regression', () => {
  it('commits the block row and checks the persist result instead of assuming it', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    const flat = source.replace(/\s+/g, ' ');
    const helper = flat.slice(
      flat.indexOf('async function executeApprovedAction('),
      flat.indexOf('// 6. REAL TELEGRAM BOT')
    );
    // The block must be pushed and then guarded by a real persist check.
    expect(helper).toContain('pushAuditEntry(existingAudit); if (!persistMemory())');
    expect(helper).toContain('rollbackAudit(existingAudit);');
    // The pre-fix shape — a bare return with the block never written — must not
    // come back. This is the exact text the branch used to emit.
    expect(helper).not.toContain(
      'errorReason: \'Action was already executed and verified previously.\', }; return { success: true, post, auditEntry: existingAudit'
    );
  });
});
