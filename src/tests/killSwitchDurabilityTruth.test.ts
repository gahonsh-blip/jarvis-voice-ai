// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/system/kill-switch` engaged the freeze and wrote its Level-4
// "🚨 GLOBAL KILL SWITCH TRIGGERED … VERIFIED" audit row, but the row was only
// ever pushed to `memoryState.auditLogs` — never explicitly persisted — and the
// route trusted `persistEmergencyState()`'s boolean, which can return true
// without writing when the file already holds the identical bytes. So a
// termination could be reported (and a Telegram notice sent) while neither the
// latch nor the row reached disk; a restart then silently released the freeze.
//
// The route now derives one durability verdict: the latch must be read back
// from disk (`emergencyStateOnDisk`) and the appended row must be present on
// disk (`diskHasAuditRow`). A real engagement whose writes did not land is
// refused with HTTP 500, the phantom row rolled back, and the Telegram notice
// suppressed. The latch is kept in memory so a disk error never silently
// un-freezes the system.
//
// This drives a real `npx tsx server.ts` process on a temp memory file.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4796;
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

async function killSwitch() {
  const res = await fetch(`${base()}/api/system/kill-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestedBy: 'TRUTH_TEST', reason: 'durability proof' }),
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
const killRowsOnDisk = (): number =>
  (onDisk().auditLogs ?? []).filter((r: any) => String(r.action ?? '').includes('GLOBAL KILL SWITCH TRIGGERED')).length;

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-kill-switch-durability-'));
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

describe('POST /api/system/kill-switch persists the freeze and its audit row', () => {
  it('engages the freeze and writes both the latch and the termination row to disk', async () => {
    const { status, body } = await killSwitch();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.actionExecuted).toBe(true);
    expect(body.outcome).toBe('ENGAGED');
    expect(body.persisted).toBe(true);

    // The claim "terminated" must be on disk, not only in process memory.
    expect(onDisk().emergencyState.emergencyPaused).toBe(true);
    expect(killRowsOnDisk()).toBe(1);
  });

  it('restores the freeze and the termination row from disk on a fresh boot', async () => {
    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/emergency/status`);

    const state = await (await fetch(`${base()}/api/emergency/status`)).json();
    expect(state.emergencyPaused).toBe(true);
    expect(killRowsOnDisk()).toBe(1);
  }, 60_000);

  it('reports a re-engagement of the already-frozen system as a no-op, with no new row', async () => {
    const before = killRowsOnDisk();
    const { status, body } = await killSwitch();
    expect(status).toBe(200);
    expect(body.actionExecuted).toBe(false);
    expect(body.outcome).toBe('ALREADY_ENGAGED');
    expect(killRowsOnDisk()).toBe(before);
  });

  it('releases the freeze durably before the refusal case', async () => {
    const { body } = await resume();
    expect(body.released).toBe(true);
    expect(onDisk().emergencyState.emergencyPaused).toBe(false);
  });

  it('refuses an engagement whose freeze cannot reach disk and rolls the row back', async () => {
    const before = killRowsOnDisk();
    fs.chmodSync(memoryFile, 0o444);

    const { status, body } = await killSwitch();
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    // The latch is kept in memory so a disk error never silently un-freezes.
    expect(body.emergencyState.emergencyPaused).toBe(true);

    // Neither the latch nor the termination row may be reported as durable.
    expect(onDisk().emergencyState.emergencyPaused).not.toBe(true);
    expect(killRowsOnDisk()).toBe(before);

    fs.chmodSync(memoryFile, 0o644);
    const release = await resume();
    expect(release.body.released).toBe(true);
  });
});

describe('the kill-switch durability wiring cannot be quietly dropped', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
  const route = src.slice(src.indexOf("app.post('/api/system/kill-switch'"));
  const body = route.slice(0, route.indexOf("app.post('/api/system/resume'"));

  it('reads the latch back from disk and confirms the row landed', () => {
    expect(body).toContain('emergencyStateOnDisk(true)');
    expect(body).toContain('diskHasAuditRow(killAuditRow.id)');
    expect(body).toContain('const persisted = statePersisted && auditPersisted');
  });

  it('refuses an engagement whose write did not land', () => {
    expect(body).toContain('if (killVerdict.actionExecuted && !persisted)');
    expect(body).toContain('res.status(500)');
  });

  it('sends the Telegram notice only for a durably held engagement', () => {
    expect(body).toContain('killVerdict.actionExecuted && persisted && activeTelegramChatId');
  });
});
