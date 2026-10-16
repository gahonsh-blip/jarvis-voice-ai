// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/security/update` (server.ts) is the surface that gates external
// actions and credential masking. It classified the request, wrote the accepted
// fields onto `securityMatrixState`, called `persistMemory()`, and discarded its
// return value — then answered `success: true` / `applied: true`.
//
// But `securityMatrixState` is a module-level object that is NOT part of
// `memoryState`. `persistMemory()` serializes `memoryState` only, so the matrix
// was never written to disk: on the next boot the gates silently reverted to the
// compile-time defaults. The route claimed a durable save it never made, and a
// restart proved the claim false.
//
// The fix persists the gates (`persistSecurityMatrixState()` copies the live
// gates into `memoryState.securityMatrix` before the write), honors the write
// result, rolls the in-memory matrix back when the write fails, and hydrates the
// matrix from the file on boot.
//
// This test drives a real `npx tsx server.ts` process against a memory file made
// read-only before the process starts, so the failure path is exercised end to
// end. A second leg restarts a fresh server on the same file to prove a
// *successful* save actually survives a restart. The source guards pin the
// wiring so a future edit cannot quietly drop the durability check or its
// rollback.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4815;
const RESTART_PORT = 4816;
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

const base = (port: number) => `http://127.0.0.1:${port}`;
const postJson = (port: number, route: string, body: unknown) =>
  fetch(`${base(port)}${route}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const getSecurity = async (port: number) => (await (await fetch(`${base(port)}/api/security`)).json()) as any;

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-security-durability-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  // Seed an empty (but valid) memory file, then make it read-only. Because the
  // file already exists, persistMemory() attempts a writeFileSync and hits
  // EACCES instead of creating a new file in the writable directory.
  fs.writeFileSync(memoryFile, '{}', 'utf-8');
  fs.chmodSync(memoryFile, 0o444);
  jarvis = startServer(JARVIS_PORT);
  await waitForServer(`${base(JARVIS_PORT)}/api/security`);
}, 60_000);

afterAll(async () => {
  await stopServer(jarvis);
  try {
    fs.chmodSync(memoryFile, 0o644);
  } catch {
    // may not exist
  }
  fs.rmSync(memoryDir, { recursive: true, force: true });
});

describe('the security-matrix update route reports a durable change honestly', () => {
  it('exposes the defaults when the persisted file carries no matrix', async () => {
    const state = await getSecurity(JARVIS_PORT);
    // The seeded file is `{}`, so the boot hydration keeps the defaults and must
    // not crash on a missing securityMatrix field.
    expect(state.currentLevel).toBe(2);
    expect(state.humanApprovalForExternal).toBe(true);
    expect(state.maskSensitiveData).toBe(true);
  });

  it('refuses to report an applied change when the write cannot reach disk', async () => {
    const res = await postJson(JARVIS_PORT, '/api/security/update', { maskSensitiveData: false });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.applied).toBe(false);
    expect(body.persisted).toBe(false);

    // The rollback must hold: the gate the write could not persist is not
    // visible, and the earlier default survives.
    const state = await getSecurity(JARVIS_PORT);
    expect(state.maskSensitiveData).toBe(true);

    // The durable file must be untouched — no partial or fabricated save.
    expect(fs.readFileSync(memoryFile, 'utf-8')).toBe('{}');
  });

  it('does not report a save when the update was rejected', async () => {
    const outOfRange = await postJson(JARVIS_PORT, '/api/security/update', { currentLevel: 9 });
    expect(outOfRange.status).toBe(400);
    expect((await outOfRange.json()).success).toBe(false);

    const empty = await postJson(JARVIS_PORT, '/api/security/update', {});
    expect(empty.status).toBe(400);
    expect((await empty.json()).success).toBe(false);
  });
});

describe('a successful security-matrix save survives a restart', () => {
  it('persists the gate to disk and reloads it on the next boot', async () => {
    // Make the file writable again and apply a real change.
    fs.chmodSync(memoryFile, 0o644);
    const res = await postJson(JARVIS_PORT, '/api/security/update', { maskSensitiveData: false });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.persisted).toBe(true);
    expect(body.securityState.maskSensitiveData).toBe(false);

    // The write must be on disk, not just in memory.
    const onDisk = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    expect(onDisk.securityMatrix.maskSensitiveData).toBe(false);

    // Restart a fresh process on the same file and confirm the gate survived.
    await stopServer(jarvis);
    jarvis = startServer(RESTART_PORT);
    await waitForServer(`${base(RESTART_PORT)}/api/security`);
    const reloaded = await getSecurity(RESTART_PORT);
    expect(reloaded.maskSensitiveData).toBe(false);
  }, 60_000);
});

describe('the security-matrix update route keeps the durability check wired', () => {
  const route = (startMarker: string, endMarker: string) => {
    const start = serverSource.indexOf(startMarker);
    return serverSource.slice(start, serverSource.indexOf(endMarker, start));
  };

  const updateRoute = route("app.post('/api/security/update'", '// Audit Trail API');

  it('gates the route on persistSecurityMatrixState() and reports failure otherwise', () => {
    expect(updateRoute).toMatch(/if \(!persistSecurityMatrixState\(\)\)/);
    expect(updateRoute).toMatch(/persisted:\s*false/);
    expect(updateRoute).toMatch(/persisted:\s*true/);
  });

  it('rolls the in-memory matrix back when the write fails', () => {
    expect(updateRoute).toMatch(/securityMatrixState\.maskSensitiveData = preGates\.maskSensitiveData/);
    expect(updateRoute).toMatch(/securityMatrixState\.currentLevel = preGates\.currentLevel/);
  });

  it('copies the live gates into the persisted snapshot before writing', () => {
    expect(serverSource).toMatch(/function persistSecurityMatrixState\(\): boolean \{/);
    expect(serverSource).toMatch(/memoryState\.securityMatrix = persistedSecurityMatrix\(\);/);
  });

  it('hydrates the matrix from the persisted snapshot on boot', () => {
    expect(serverSource).toMatch(/securityMatrixState\.currentLevel = level;/);
    expect(serverSource).toMatch(/memoryState\.securityMatrix = persistedSecurityMatrix\(\);/);
  });
});
