// ==============================================================================
// END-TO-END computer operator test against a real server process.
//
// Exercises the real HTTP surface the UI talks to, so the wiring between the UI
// client, the server, and the host executor is verified rather than assumed.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 3322;
const BASE = `http://127.0.0.1:${PORT}`;
const ROOT = process.cwd();

let server: ChildProcess | null = null;
let screenshotDir: string;
let memoryFile: string;

async function waitForHealth(timeoutMs = 40_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Server did not become healthy on ${BASE}`);
}

function action(type: string, extra: Record<string, unknown> = {}) {
  return {
    id: `e2e-${type}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    description: `e2e ${type}`,
    securityLevel: 1,
    requiresHumanApproval: false,
    ...extra,
  };
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('Computer Operator E2E (real server process)', () => {
  beforeAll(async () => {
    screenshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-op-e2e-'));
    // Point the server's durable state at a throwaway file so the e2e run never
    // mutates the repository's jarvis_memory.json.
    memoryFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-mem-e2e-')), 'memory.json');
    const tsxBin = path.join(ROOT, 'node_modules', '.bin', 'tsx');
    server = spawn(tsxBin, ['server.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'production',
        JARVIS_SCREENSHOT_DIR: screenshotDir,
        JARVIS_MEMORY_FILE: memoryFile,
      },
      stdio: 'ignore',
      detached: true,
    });
    await waitForHealth();
  }, 60_000);

  afterAll(() => {
    if (server && server.pid && !server.killed) {
      try {
        process.kill(-server.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    }
    server = null;
    fs.rmSync(screenshotDir, { recursive: true, force: true });
    fs.rmSync(path.dirname(memoryFile), { recursive: true, force: true });
  });

  it('reports host capabilities honestly', async () => {
    const res = await fetch(`${BASE}/api/computer-operator/host-capabilities`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.syntheticInputAvailable).toBe(false);
    expect(body.operatorActions.CLICK.available).toBe(false);
    expect(body.operatorActions.CLICK.reason).toBeTruthy();
    expect(body.operatorActions.TERMINAL_COMMAND.available).toBe(true);
    // The screenshot root must be the configured one, not a hardcoded C:\ path.
    expect(body.screenshotRoot).toBe(screenshotDir);
    expect(JSON.stringify(body)).not.toContain('C:\\Jarvis');
  });

  it('runs a real terminal command through the operator endpoint', async () => {
    const { status, body } = await post('/api/computer-operator/execute-action', {
      action: action('TERMINAL_COMMAND', { command: 'node -e "console.log(7*6)"' }),
    });
    expect(status).toBe(200);
    expect(body.outcome).toBe('VERIFIED');
    expect(body.receipt.verified).toBe(true);
    expect(body.output).toContain('42');
  });

  it('reports a failing command as FAILED with the real exit code', async () => {
    const { status, body } = await post('/api/computer-operator/execute-action', {
      action: action('TERMINAL_COMMAND', { command: 'node -e "process.exit(9)"' }),
    });
    expect(status).toBe(500);
    expect(body.outcome).toBe('FAILED');
    expect(body.receipt.verified).toBe(false);
    expect(body.exitCode).toBe(9);
  });

  it('refuses synthetic input with NOT_AVAILABLE over HTTP', async () => {
    for (const type of ['CLICK', 'TYPE_TEXT', 'KEY_COMBINATION']) {
      const { status, body } = await post('/api/computer-operator/execute-action', {
        action: action(type, { coordinates: { x: 3, y: 4 }, text: 'hi' }),
      });
      expect(status).toBe(501);
      expect(body.outcome).toBe('NOT_AVAILABLE');
      expect(body.receipt.verified).toBe(false);
    }
  });

  it('reads a real file from the workspace', async () => {
    const { body } = await post('/api/computer-operator/execute-action', {
      action: action('READ_FILE', { filePath: 'package.json' }),
    });
    expect(body.outcome).toBe('VERIFIED');
    expect(body.output).toContain('jarvis-voice-ai');
    expect(body.receipt.evidence.kind).toBe('local_file');
    expect(body.receipt.evidence.sizeBytes).toBeGreaterThan(0);
  });

  it('blocks reading outside the workspace', async () => {
    const { status, body } = await post('/api/computer-operator/execute-action', {
      action: action('READ_FILE', { filePath: '../../etc/passwd' }),
    });
    expect(status).toBe(403);
    expect(body.outcome).toBe('BLOCKED');
    expect(body.receipt.failureReason).toBe('PATH_OUTSIDE_WORKSPACE');
  });

  it('rejects a malformed action', async () => {
    const { status, body } = await post('/api/computer-operator/execute-action', { action: {} });
    expect(status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('reports screenshots honestly for this host', async () => {
    const { status, body } = await post('/api/computer-operator/screenshot', { label: 'e2e' });

    if (body.outcome === 'VERIFIED') {
      expect(status).toBe(200);
      expect(body.verified).toBe(true);
      expect(body.file.absolutePath.startsWith(screenshotDir)).toBe(true);
      expect(fs.existsSync(body.file.absolutePath)).toBe(true);
      expect(body.file.sizeBytes).toBeGreaterThan(0);
      expect(body.file.sha256).toMatch(/^[a-f0-9]{64}$/);
      fs.rmSync(body.file.absolutePath, { force: true });
    } else {
      // A headless host must say so and must not report success or a fake path.
      expect(status).toBe(501);
      expect(body.verified).toBe(false);
      expect(body.file).toBeNull();
      expect(body.receipt.outcome).toBe('NOT_AVAILABLE');
      expect(body.receipt.detailEn).not.toContain('C:\\Jarvis');
    }
  });

  it('reports the kill switch as blocking operator actions', async () => {
    // Engage the emergency stop, then confirm the operator refuses to act.
    const engage = await post('/api/emergency/toggle', { requestedBy: 'E2E_TEST', reason: 'e2e kill switch check' });
    expect(engage.status).toBe(200);
    expect(engage.body.emergencyPaused).toBe(true);

    const blocked = await post('/api/computer-operator/execute-action', {
      action: action('TERMINAL_COMMAND', { command: 'node -e "console.log(1)"' }),
    });
    expect(blocked.status).toBe(423);
    expect(blocked.body.outcome).toBe('BLOCKED');
    expect(blocked.body.success).toBe(false);

    // Always restore the kill switch so later tests are unaffected.
    const release = await post('/api/emergency/toggle', { requestedBy: 'E2E_TEST', reason: 'e2e cleanup' });
    expect(release.body.emergencyPaused).toBe(false);
  }, 30_000);

  it('never reports a fake screenshot path', async () => {
    const res = await fetch(`${BASE}/api/computer-operator/host-capabilities`);
    const text = await res.text();
    expect(text).not.toContain('C:\\\\Jarvis');
    expect(text).not.toContain('141 tests passed');
  });
});