// ==============================================================================
// Backlog item 13 — "zero fake success" (durability of the safety freeze).
//
// The emergency stop / global kill switch lives in `emergencyState`, a
// module-level object in `server_tools.ts` that is NOT part of `memoryState`.
// `persistMemory()` serializes `memoryState` only, so the freeze was never
// written to disk: on the next boot it silently reverted to the compile-time
// `false`. An operator who pulled the kill switch and saw "HARD PAUSE ACTIVE"
// got a system that was running again after a restart — the most dangerous kind
// of false success, because the operator still believes the stop holds.
//
// The fix persists the freeze (`persistEmergencyState()` copies the live state
// into `memoryState.emergencyState` before the durable write), hydrates it on
// boot, and names the durability gap with `persisted` in the toggle /
// kill-switch / resume responses. The latch is always kept in memory, so a disk
// error never silently un-freezes the system.
//
// This test drives a real `npx tsx server.ts` process, engages the kill switch,
// then restarts a fresh process on the same memory file to prove the freeze
// survived. The source guards pin the wiring so a future edit cannot quietly
// drop the persistence, the boot hydration, or the honest `persisted` field.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIRST_PORT = 4817;
const RESTART_PORT = 4818;
let jarvis: ChildProcess | undefined;
let memoryDir: string;
let memoryFile: string;

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const toolsSource = fs.readFileSync(path.resolve(process.cwd(), 'server_tools.ts'), 'utf8');

const base = (port: number) => `http://127.0.0.1:${port}`;
const postJson = (port: number, route: string, body: unknown) =>
  fetch(`${base(port)}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const getEmergency = async (port: number) =>
  (await (await fetch(`${base(port)}/api/emergency/status`)).json()) as any;

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

function startServer(port: number): ChildProcess {
  return spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(port),
      JARVIS_MEMORY_FILE: memoryFile,
      GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });
}

async function stopServer(proc: ChildProcess | undefined): Promise<void> {
  if (!proc?.pid) return;
  try {
    process.kill(-proc.pid, 'SIGTERM');
  } catch {
    proc.kill('SIGTERM');
  }
  await new Promise((r) => setTimeout(r, 1200));
  try {
    process.kill(-proc.pid, 'SIGKILL');
  } catch {
    // already gone
  }
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-emergency-durability-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  // Seed an empty (but valid) memory file so boot hydration runs against a file
  // that carries no emergencyState field.
  fs.writeFileSync(memoryFile, '{}', 'utf-8');
  jarvis = startServer(FIRST_PORT);
  await waitForServer(`${base(FIRST_PORT)}/api/emergency/status`);
}, 60_000);

afterAll(async () => {
  await stopServer(jarvis);
  try {
    fs.rmSync(memoryDir, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

describe('the kill switch survives a restart', () => {
  it('engages the latch, reports persisted, and writes the freeze to disk', async () => {
    const res = await postJson(FIRST_PORT, '/api/system/kill-switch', {
      requestedBy: 'DURABILITY_TEST',
      reason: 'prove the freeze survives a restart',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.actionExecuted).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.emergencyState.emergencyPaused).toBe(true);

    // The freeze must be on disk, not just in memory. `emergencyPaused` is the
    // latch every gate reads; `hardKillSwitchTriggered` is a read-only field the
    // kill-switch activation never sets, so it is not asserted here.
    const onDisk = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    expect(onDisk.emergencyState.emergencyPaused).toBe(true);
  });

  it('restores the freeze from disk on a fresh boot', async () => {
    await stopServer(jarvis);
    jarvis = startServer(RESTART_PORT);
    await waitForServer(`${base(RESTART_PORT)}/api/emergency/status`);

    const state = await getEmergency(RESTART_PORT);
    // This is the assertion that fails without the fix: the fresh process read
    // its compile-time `false` instead of the persisted freeze.
    expect(state.emergencyPaused).toBe(true);
  }, 60_000);

  it('releases the latch durably and reports persisted', async () => {
    const res = await postJson(RESTART_PORT, '/api/system/resume', {
      requestedBy: 'DURABILITY_TEST',
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.released).toBe(true);
    expect(body.persisted).toBe(true);

    const onDisk = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    expect(onDisk.emergencyState.emergencyPaused).toBe(false);
  });
});

describe('the durability wiring cannot be quietly dropped', () => {
  it('defines the persist/hydrate helpers outside memoryState', () => {
    expect(serverSource).toMatch(/function persistEmergencyState\(\): boolean \{/);
    expect(serverSource).toMatch(/memoryState\.emergencyState = persistedEmergencyState\(\);/);
    expect(toolsSource).toMatch(/export function persistedEmergencyState\(\)/);
    expect(toolsSource).toMatch(/export function hydrateEmergencyState\(/);
  });

  it('hydrates the freeze on boot', () => {
    expect(serverSource).toMatch(/hydrateEmergencyState\(\{/);
    expect(serverSource).toMatch(/memoryState\.emergencyState = persistedEmergencyState\(\);/);
  });

  it('reports the write result as `persisted` on the kill-switch and resume routes', () => {
    const killSwitchRoute = serverSource.slice(
      serverSource.indexOf("app.post('/api/system/kill-switch'"),
      serverSource.indexOf("app.post('/api/system/resume'"),
    );
    // The kill-switch `persisted` is now the conjunction of the latch write and
    // the termination row landing on disk, so neither can be reported alone.
    expect(killSwitchRoute).toMatch(/const statePersisted = persistEmergencyState\(\) && emergencyStateOnDisk\(true\);/);
    expect(killSwitchRoute).toMatch(/const auditPersisted =[\s\S]*?diskHasAuditRow\(killAuditRow\.id\)/);
    expect(killSwitchRoute).toMatch(/const persisted = statePersisted && auditPersisted;/);
    expect(killSwitchRoute).toMatch(/persisted,/);

    const resumeRoute = serverSource.slice(
      serverSource.indexOf("app.post('/api/system/resume'"),
      serverSource.indexOf('// Approvals & Action Requests Registry'),
    );
    // The resume `persisted` is the same conjunction: the cleared latch must be
    // read back from disk and the release row confirmed present, so a release
    // that never reached disk is not reported as durable.
    expect(resumeRoute).toMatch(/const statePersisted = persistEmergencyState\(\) && emergencyStateOnDisk\(false\);/);
    expect(resumeRoute).toMatch(/const auditPersisted = persistMemory\(\) && diskHasAuditRow\(auditRow\.id\);/);
    expect(resumeRoute).toMatch(/const persisted = statePersisted && auditPersisted;/);
    expect(resumeRoute).toMatch(/persisted,/);
  });
});
