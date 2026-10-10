// ==============================================================================
// Tests for fix-plan route success truth (item 13, continued).
//
// `POST /api/github/fix-plan` answered `success: true` unconditionally, even
// after `reconcileFixPlanWithCoverage` downgraded the plan's receipt to
// UNVERIFIED because the scan never covered the scope. The response body then
// contradicted itself: `success: true` beside a receipt that said the plan was
// not verified. A caller reading `success` reported a working plan over a scope
// that was never inspected.
//
// The route now derives `success` from `plan.receipt.verified`, so the two can
// never disagree. A real server process runs with a blanked token, which makes
// the account scan return nothing and deterministically forces the uncovered
// branch without a credential or network. Source guards pin the wiring.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4771;
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

function startServer(): ChildProcess {
  return spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(JARVIS_PORT),
      JARVIS_MEMORY_FILE: memoryFile,
      // Blank the token so the account scan is a no-credential NOT_CONFIGURED
      // result deterministically, instead of calling GitHub.
      GITHUB_TOKEN: '',
      GITHUB_AUTOMATION_TOKEN: '',
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

async function runFixPlan(): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base()}/api/github/fix-plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-fixplan-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/memory`);
}, 60_000);

afterAll(async () => {
  await stopServer();
  fs.rmSync(memoryDir, { recursive: true, force: true });
});

describe('POST /api/github/fix-plan reports success consistently with its receipt', () => {
  it('does not claim success over a scope that was never scanned', async () => {
    const { status, body } = await runFixPlan();
    // A NOT_CONFIGURED scan covers nothing, so the plan must not read as a
    // successful all-clear.
    expect(status).toBe(200);
    expect(body.receipt.outcome).not.toBe('VERIFIED');
    expect(body.receipt.verified).toBe(false);
    // The reported `success` must agree with the receipt inside the same body.
    expect(body.success).toBe(body.receipt.verified);
    expect(body.success).toBe(false);
    // And no all-clear may be presented.
    expect(body.nothingToDo).toBe(false);
    expect(body.coverage.covered).toBe(false);
  });
});

describe('the fix-plan route derives success from the receipt, not a literal', () => {
  const route = serverSource.slice(
    serverSource.indexOf("app.post('/api/github/fix-plan'"),
    serverSource.indexOf("app.get('/api/github/approvals'")
  );

  it('uses the receipt verdict for success', () => {
    expect(route).toContain('success: plan.receipt.verified,');
    expect(route).not.toMatch(/res\.json\(\{\s*success: true,\s*outcome: plan\.receipt\.outcome/);
  });
});
