// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// The daemon's SIGTERM / SIGINT handlers in `server.ts` discarded
// `persistMemory()`'s verdict and always `process.exit(0)`. A shutdown whose
// final save was refused (read-only mount, full disk, permission denied) still
// logged "shutting down gracefully" and exited 0, so lost state was
// indistinguishable from a clean flush to any operator or supervisor watching
// the exit code.
//
// The handler now derives its exit code from the observed durability verdict via
// `shutdownOutcome`. The helper is exercised directly, the wiring is pinned by
// source guards, and the real server process is spawned to confirm both a
// durable shutdown (exit 0, file on disk) and a refused one (exit 1).
// ==============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shutdownOutcome } from '../utils/hardening/daemonShutdownDurabilityTruth';

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

const spawned: ChildProcess[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  for (const child of spawned.splice(0)) {
    try {
      child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
  for (const dir of tempDirs.splice(0)) {
    try {
      fs.chmodSync(dir, 0o700);
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

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

/**
 * Boot the real daemon with `JARVIS_MEMORY_FILE` pointed at `memoryDir`, wait
 * until it answers, send SIGTERM, and return the observed exit code.
 */
async function shutdownExitCode(port: number, memoryDir: string): Promise<number | null> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      JARVIS_MEMORY_FILE: path.join(memoryDir, 'memory.json'),
      GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });
  spawned.push(child);

  const exited = new Promise<number | null>((resolve) => {
    child.on('exit', (code) => resolve(code));
  });

  await waitForServer(`http://127.0.0.1:${port}/api/memory`);
  child.kill('SIGTERM');
  return exited;
}

describe('daemon shutdown durability verdict', () => {
  it('reports exit 0 only when the final write landed', () => {
    const ok = shutdownOutcome('SIGTERM', true);
    expect(ok.exitCode).toBe(0);
    expect(ok.logLine).toContain('SIGTERM');
  });

  it('reports a non-zero exit when the final write was refused', () => {
    const refused = shutdownOutcome('SIGINT', false);
    expect(refused.exitCode).toBe(1);
    expect(refused.logLine).toContain('SIGINT');
    expect(refused.logLine).toMatch(/NOT PERSISTED/i);
  });

  it('does not claim a graceful shutdown when the write was refused', () => {
    expect(shutdownOutcome('SIGTERM', false).logLine).not.toMatch(/gracefully/i);
    expect(shutdownOutcome('SIGTERM', true).logLine).toMatch(/gracefully/i);
  });

  it('names the signal it was invoked with', () => {
    expect(shutdownOutcome('SIGINT', false).logLine).toContain('SIGINT');
    expect(shutdownOutcome('SIGTERM', true).logLine).toContain('SIGTERM');
  });
});

describe('daemon shutdown wiring (source guards)', () => {
  it('routes both signals through a handler that uses the durability verdict', () => {
    expect(serverSource).toContain('shutdownOutcome');
    expect(serverSource).toContain("process.on('SIGTERM', () => handleShutdown('SIGTERM'))");
    expect(serverSource).toContain("process.on('SIGINT', () => handleShutdown('SIGINT'))");
  });

  it('no longer discards the persistMemory verdict before exiting 0', () => {
    // The pre-fix pattern: persistMemory() as a bare statement, then exit(0).
    expect(serverSource).not.toMatch(/persistMemory\(\);\s*\n\s*process\.exit\(0\);/);
  });
});

describe('daemon shutdown durability (real process)', () => {
  it('exits 0 and leaves the state on disk when the write succeeds', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-shutdown-ok-'));
    tempDirs.push(dir);
    const code = await shutdownExitCode(4791, dir);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dir, 'memory.json'))).toBe(true);
  }, 60_000);

  it('exits non-zero when the final write is refused', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-shutdown-ro-'));
    tempDirs.push(dir);
    // Read-only directory: persistMemory() cannot write jarvis_memory.json.
    fs.chmodSync(dir, 0o500);
    const code = await shutdownExitCode(4792, dir);
    expect(code).not.toBe(0);
    expect(fs.existsSync(path.join(dir, 'memory.json'))).toBe(false);
  }, 60_000);
});
