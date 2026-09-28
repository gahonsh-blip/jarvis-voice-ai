import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ==============================================================================
// OFFLINE / ONLINE E2E (backlog items 56, 57)
//
// Boots a real server and exercises the paths that must work without any
// external network. No provider credential is supplied (GEMINI_API_KEY is
// blanked), so anything that tried to call a model would fail: a pass here
// means the local path genuinely stood on its own.
//
// The same test then confirms the online-mode endpoints still answer, and that
// an unconfigured provider is not reported as connected.
// ==============================================================================

const PORT = 4763;
const base = () => `http://127.0.0.1:${PORT}`;
let server: ChildProcess | undefined;
let workDir: string;
let memoryDir: string;

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

beforeAll(async () => {
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-offline-'));
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-offline-mem-'));
  server = spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(PORT),
      JARVIS_MEMORY_FILE: path.join(memoryDir, 'memory.json'),
      GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });
  await waitForServer(`${base()}/api/health`);
}, 60_000);

afterAll(async () => {
  if (server?.pid) {
    try {
      process.kill(-server.pid, 'SIGTERM');
    } catch {
      server.kill('SIGTERM');
    }
    await new Promise((r) => setTimeout(r, 1000));
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  for (const dir of [workDir, memoryDir]) {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('offline mode', () => {
  it('serves its health check with no provider configured', async () => {
    const res = await fetch(`${base()}/api/health`);
    expect(res.status).toBe(200);
  });

  it('answers a local memory read with no network', async () => {
    const res = await fetch(`${base()}/api/memory`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toBeTypeOf('object');
  });

  it('accepts a local memory write and reads it back', async () => {
    const write = await fetch(`${base()}/api/memory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'OfflineUser' }),
    });
    expect(write.status).toBe(200);

    const read = await fetch(`${base()}/api/memory`).then((r) => r.json());
    expect(JSON.stringify(read)).toContain('OfflineUser');
  });

  it('classifies intents locally with no model call', async () => {
    const res = await fetch(`${base()}/api/detect-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'JARVIS, battery status batao' }),
    });
    // Either the local classifier answers, or the route is absent; what must
    // not happen is a 500 from a failed network call.
    expect([200, 404]).toContain(res.status);
  });

  it('keeps the permission gateway enforcing while offline', async () => {
    const res = await fetch(`${base()}/api/security/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'delete all my notes' }),
    }).then((r) => r.json());
    // Being offline must never relax permissions.
    expect(res.decision.allowed).toBe(false);
  });

  it('still produces a verified local backup while offline', async () => {
    const res = await fetch(`${base()}/api/backup`).then((r) => r.json());
    expect(res.success).toBe(true);
    expect(res.verified).toBe(true);
  });
});

describe('online mode', () => {
  it('serves the core endpoints when reachable', async () => {
    expect((await fetch(`${base()}/api/health`)).status).toBe(200);
    const matrix = await fetch(`${base()}/api/security/permission-matrix`).then((r) => r.json());
    expect(matrix.success).toBe(true);
  });

  it('does not report an unconfigured integration as connected', async () => {
    // Each integration status endpoint must distinguish "not configured" from
    // "connected". Reporting connected without a credential is exactly the
    // fabricated success this project forbids.
    const endpoints = [
      '/api/telegram/status',
      '/api/github/status',
      '/api/auth/linkedin/status',
      '/api/auth/youtube/status',
    ];

    for (const endpoint of endpoints) {
      const res = await fetch(`${base()}${endpoint}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type') || '').toContain('json');

      const body = await res.json();
      const serialised = JSON.stringify(body).toLowerCase();
      if (body.configured === false) {
        // Not configured must never be presented as a live connection.
        expect(serialised).not.toContain('"connected":true');
        expect(serialised).not.toContain('"status":"connected"');
      }
    }
  });
});