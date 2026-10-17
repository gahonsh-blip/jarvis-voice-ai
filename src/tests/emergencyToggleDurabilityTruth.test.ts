// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/emergency/toggle` reported the engagement of the safety freeze and
// wrote its Level-4 "EMERGENCY STOP ACTIVATED … VERIFIED" audit row, but the row
// (and the freeze itself) were gated only on `persistMemory()`, which can return
// true without writing when the file already holds the identical bytes — and the
// engagement honesty did not depend on the state write at all. So a transition
// could be reported as held and audited as verified while neither the latch nor
// the row reached disk.
//
// The route now derives a single durability verdict: the freeze must be read
// back from disk (`emergencyStateOnDisk`) and the appended audit row must be
// present on disk (`diskHasAuditRow`). An engagement whose writes did not land
// is refused with HTTP 500 and the row rolled back; the latch is still kept in
// memory so a disk error never silently un-freezes the system.
//
// This test drives a real `npx tsx server.ts` process on a temp memory file:
// the latch and the row must be on disk, must survive a real restart, and a
// read-only volume must be refused with the row rolled back.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4795;
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

async function toggle() {
  const res = await fetch(`${base()}/api/emergency/toggle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestedBy: 'TRUTH_TEST', reason: 'durability proof' }),
  });
  return { status: res.status, body: await res.json() };
}

const onDisk = (): any => JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
const activationRowsOnDisk = (): number =>
  (onDisk().auditLogs ?? []).filter((r: any) => String(r.action ?? '').includes('EMERGENCY STOP ACTIVATED')).length;

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-emergency-toggle-durability-'));
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

describe('POST /api/emergency/toggle persists the freeze and its audit row', () => {
  it('engages the freeze and writes both the latch and the activation row to disk', async () => {
    const { status, body } = await toggle();
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.actionExecuted).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.emergencyPaused).toBe(true);

    // The claim "PAUSED" must be on disk, not only in process memory.
    expect(onDisk().emergencyState.emergencyPaused).toBe(true);
    expect(activationRowsOnDisk()).toBe(1);
  });

  it('restores the freeze and the audit row from disk on a fresh boot', async () => {
    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/emergency/status`);

    const state = await (await fetch(`${base()}/api/emergency/status`)).json();
    expect(state.emergencyPaused).toBe(true);
    expect(activationRowsOnDisk()).toBe(1);
  }, 60_000);

  it('releases the freeze durably before the refusal case', async () => {
    const { status, body } = await toggle();
    expect(status).toBe(200);
    expect(body.persisted).toBe(true);
    expect(body.emergencyPaused).toBe(false);
    expect(onDisk().emergencyState.emergencyPaused).toBe(false);
  });

  it('refuses a stop whose freeze cannot reach disk and rolls the activation row back', async () => {
    const before = activationRowsOnDisk();
    fs.chmodSync(memoryFile, 0o444);

    const { status, body } = await toggle();
    expect(status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.persisted).toBe(false);
    // The latch is kept in memory so a disk error never silently un-freezes.
    expect(body.emergencyState.emergencyPaused).toBe(true);

    // Neither the latch nor the activation row may be reported as durable.
    expect(onDisk().emergencyState.emergencyPaused).not.toBe(true);
    expect(activationRowsOnDisk()).toBe(before);

    fs.chmodSync(memoryFile, 0o644);
    // Restore a clean state for any later run.
    const release = await toggle();
    expect(release.body.emergencyPaused).toBe(false);
  });
});

describe('the toggle durability wiring cannot be quietly dropped', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '../../server.ts'), 'utf8');
  const route = src.slice(src.indexOf("app.post('/api/emergency/toggle'"));
  const body = route.slice(0, route.indexOf('// Global Kill Switch API'));

  it('defines the disk read-back helper', () => {
    expect(src).toMatch(/function emergencyStateOnDisk\(expected: boolean\): boolean \{/);
  });

  it('gates the reported result on both disk read-backs', () => {
    expect(body).toContain('emergencyStateOnDisk(engaged)');
    expect(body).toContain('diskHasAuditRow(auditRow.id)');
    expect(body).toContain('const persisted = statePersisted && auditPersisted');
  });

  it('refuses an engagement whose write did not land', () => {
    expect(body).toContain('if (engaged && !persisted)');
    expect(body).toContain('res.status(500)');
  });
});
