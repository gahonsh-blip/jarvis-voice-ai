// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/system/resume` released the emergency freeze and wrote its Level-4
// "🟢 SYSTEM RESUMED … VERIFIED" audit row, then reported `persisted` from the
// raw `persistEmergencyState()` boolean — which can return true without writing
// when the file already holds the identical bytes — and never read the cleared
// latch or the appended row back from disk. So a release that never reached disk
// could be reported (and the Telegram resumption notice sent) while the next
// boot still read the freeze as engaged. The route never rolled back a phantom
// row either.
//
// The route now derives one durability verdict: the cleared latch must be read
// back from disk (`emergencyStateOnDisk(false)`) and the appended row must be
// present on disk (`diskHasAuditRow`). A release whose writes did not land is
// refused with HTTP 500, the phantom row rolled back, and the Telegram notice
// suppressed. The release is kept in memory so a disk error does not leave the
// system looking frozen.
//
// This drives a real `npx tsx server.ts` process on a temp memory file.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4797;
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

async function engage() {
  const res = await fetch(`${base()}/api/emergency/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestedBy: 'TRUTH_TEST', action: 'stop', reason: 'durability proof' }),
  });
  return { status: res.status, body: await res.json() };
}

async function resume() {
  const res = await fetch(`${base()}/api/system/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestedBy: 'TRUTH_TEST' }),
  });
  return { status: res.status, body: await res.json() };
}

const onDisk = (): any => JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
const resumeRowsOnDisk = (): number =>
  (onDisk().auditLogs ?? []).filter((r: any) => String(r.action ?? '').includes('SYSTEM RESUMED')).length;

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-resume-durability-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/emergency/status`);
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

describe('POST /api/system/resume persists the release and its audit row', () => {
  it('releases a durably engaged freeze and writes the cleared latch + row to disk', async () => {
    const engaged = await engage();
    expect(engaged.body.persisted).toBe(true);
    expect(onDisk().emergencyState.emergencyPaused).toBe(true);

    const { status, body } = await resume();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.released).toBe(true);
    expect(body.persisted).toBe(true);

    // The claim "resumed" must be on disk, not only in process memory.
    expect(onDisk().emergencyState.emergencyPaused).toBe(false);
    expect(resumeRowsOnDisk()).toBe(1);
  });

  it('restores the released state and the resume row from disk on a fresh boot', async () => {
    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/emergency/status`);

    const state = await (await fetch(`${base()}/api/emergency/status`)).json();
    expect(state.emergencyPaused).toBe(false);
    expect(resumeRowsOnDisk()).toBe(1);
  }, 60_000);

  it('refuses a release whose writes cannot reach disk and rolls the row back', async () => {
    await engage();
    expect(onDisk().emergencyState.emergencyPaused).toBe(true);
    const rowsBefore = resumeRowsOnDisk();

    fs.chmodSync(memoryFile, 0o444);
    const { status, body } = await resume();
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.released).toBe(false);
    expect(body.persisted).toBe(false);
    // The release is kept in memory so a disk error does not look frozen...
    expect(body.emergencyState.emergencyPaused).toBe(false);
    // ...but the durable record must still hold the freeze and must not gain a
    // "resumed" row it never earned.
    expect(onDisk().emergencyState.emergencyPaused).toBe(true);
    expect(resumeRowsOnDisk()).toBe(rowsBefore);

    // Once the volume is writable again the release succeeds and is durable.
    fs.chmodSync(memoryFile, 0o644);
    await engage();
    const retry = await resume();
    expect(retry.body.released).toBe(true);
    expect(retry.body.persisted).toBe(true);
    expect(onDisk().emergencyState.emergencyPaused).toBe(false);
  });
});

describe('the resume durability wiring cannot be quietly dropped', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
  const route = src.slice(src.indexOf("app.post('/api/system/resume'"));
  const body = route.slice(0, route.indexOf('// Approvals & Action Requests Registry'));

  it('reads the cleared latch back from disk and confirms the row landed', () => {
    expect(body).toContain('emergencyStateOnDisk(false)');
    expect(body).toContain('diskHasAuditRow(auditRow.id)');
    expect(body).toContain('const persisted = statePersisted && auditPersisted');
  });

  it('refuses a release whose write did not land', () => {
    expect(body).toContain('if (!persisted)');
    expect(body).toContain('res.status(500)');
    expect(body).toContain('released: false');
  });

  it('sends the Telegram resumption notice only for a durable release', () => {
    const noticeIndex = body.indexOf('Resumption notice');
    const guardIndex = body.indexOf('if (!persisted)');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(noticeIndex).toBeGreaterThan(guardIndex);
  });
});
