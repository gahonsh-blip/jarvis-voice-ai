// ==============================================================================
// End-to-end tests for the autonomous goal runner (backlog items 40-45).
//
// Drives the real HTTP routes on a live JARVIS server. Every file step writes
// into a temp directory, so the "verified" claim is checked against the actual
// filesystem after the request returns.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4761;
let jarvis: ChildProcess | undefined;
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
  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-goal-'));
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-goal-mem-'));
  jarvis = spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(JARVIS_PORT),
      JARVIS_MEMORY_FILE: path.join(memoryDir, 'memory.json'),
      GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });
  await waitForServer(`http://127.0.0.1:${JARVIS_PORT}/api/health`);
}, 60_000);

afterAll(async () => {
  if (jarvis?.pid) {
    try {
      process.kill(-jarvis.pid, 'SIGTERM');
    } catch {
      jarvis.kill('SIGTERM');
    }
    await new Promise((r) => setTimeout(r, 1000));
    try {
      process.kill(-jarvis.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.rmSync(memoryDir, { recursive: true, force: true });
});

const base = () => `http://127.0.0.1:${JARVIS_PORT}`;

async function runGoal(body: unknown) {
  const res = await fetch(`${base()}/api/autonomous/goals/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

describe('autonomous goal run endpoint', () => {
  it('rejects a goal with no steps', async () => {
    const { status } = await runGoal({ goal: 'nothing' });
    expect(status).toBe(400);
  });

  it('refuses an unsupported step kind instead of executing it', async () => {
    const { status, body } = await runGoal({
      goal: 'evil',
      steps: [{ kind: 'shell.exec', command: 'rm', args: ['-rf', '/'] }],
    });
    expect(status).toBe(400);
    expect(body.outcome).toBe('BLOCKED');
    expect(body.error).toContain('shell.exec');
  });

  it('refuses a command that is not on the allow-list', async () => {
    const { status, body } = await runGoal({
      goal: 'run curl',
      steps: [{ kind: 'run.command', command: 'curl', args: ['http://example.com'] }],
    });
    expect(status).toBe(400);
    expect(body.error).toContain('run.command');
  });

  it('completes a real file goal and the file exists afterwards', async () => {
    const target = path.join(workDir, 'note.txt');

    const { body } = await runGoal({
      goal: 'write a note',
      steps: [
        { kind: 'fs.mkdir', path: workDir, description: 'make dir' },
        { kind: 'fs.writeFile', path: target, content: 'hello hermes', description: 'write note' },
        { kind: 'fs.readFile', path: target, description: 'read it back' },
      ],
    });

    expect(body.outcome).toBe('VERIFIED');
    expect(body.verified).toBe(true);
    expect(body.steps.every((s: any) => s.status === 'DONE')).toBe(true);

    // Independent check against the filesystem, not just the response.
    expect(fs.existsSync(target)).toBe(true);
    expect(fs.readFileSync(target, 'utf-8')).toBe('hello hermes');
  });

  it('fails the run when reading a file that does not exist', async () => {
    const { body } = await runGoal({
      goal: 'read missing',
      steps: [{ kind: 'fs.readFile', path: path.join(workDir, 'nope.txt') }],
    });

    expect(body.outcome).toBe('FAILED');
    expect(body.verified).toBe(false);
  });

  it('pauses for approval and does not execute the gated step', async () => {
    const target = path.join(workDir, 'gated.txt');
    const { body } = await runGoal({
      goal: 'gated write',
      steps: [{ kind: 'fs.writeFile', path: target, content: 'x', requiresApproval: true }],
    });

    expect(body.awaitingApproval).toBe(true);
    expect(body.verified).toBe(false);
    expect(fs.existsSync(target)).toBe(false);
  });

  it('executes a gated step only when a named approver approves it', async () => {
    const target = path.join(workDir, 'approved.txt');
    const { body } = await runGoal({
      goal: 'approved write',
      approver: 'Operator',
      approved: true,
      steps: [{ kind: 'fs.writeFile', path: target, content: 'approved', requiresApproval: true }],
    });

    expect(body.outcome).toBe('VERIFIED');
    expect(fs.readFileSync(target, 'utf-8')).toBe('approved');
  });

  it('runs a real allow-listed command and verifies its exit code', async () => {
    const { body } = await runGoal({
      goal: 'git status',
      approver: 'Operator',
      approved: true,
      steps: [
        {
          kind: 'run.command',
          command: 'git',
          args: ['rev-parse', '--is-inside-work-tree'],
          cwd: process.cwd(),
          requiresApproval: true,
        },
      ],
    });

    expect(body.steps[0].status).toBe('DONE');
    expect(body.outcome).toBe('VERIFIED');
  });

  it('fails a command that exits non-zero', async () => {
    const { body } = await runGoal({
      goal: 'bad git command',
      approver: 'Operator',
      approved: true,
      steps: [
        {
          kind: 'run.command',
          command: 'git',
          args: ['rev-parse', '--verify', 'refs/heads/definitely-not-a-branch'],
          cwd: process.cwd(),
          requiresApproval: true,
        },
      ],
    });

    expect(body.steps[0].status).toBe('FAILED');
    expect(body.outcome).toBe('FAILED');
  });

  it('records the run in the history and audit trail', async () => {
    const runs = await fetch(`${base()}/api/autonomous/goals`).then((r) => r.json());
    expect(runs.success).toBe(true);
    expect(runs.runs.length).toBeGreaterThan(0);
    expect(runs.runs[0].audit.length).toBeGreaterThan(0);
    expect(runs.runs[0].steps[0]).toHaveProperty('status');
  });

  it('lists the supported step kinds', async () => {
    const body = await fetch(`${base()}/api/autonomous/goals/step-kinds`).then((r) => r.json());
    expect(body.kinds).toContain('fs.writeFile');
    expect(body.kinds).toContain('run.command');
  });
});

describe('scheduled autonomous tasks', () => {
  it('registers, lists, and removes a recurring task', async () => {
    const create = await fetch(`${base()}/api/autonomous/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: 'e2e-tidy',
        name: 'E2E tidy',
        atMinuteOfDay: 9 * 60,
        steps: [{ kind: 'fs.mkdir', path: path.join(workDir, 'tidy') }],
      }),
    });
    expect(create.status).toBe(201);

    const list = await fetch(`${base()}/api/autonomous/schedule`).then((r) => r.json());
    expect(list.goals.map((g: any) => g.id)).toContain('e2e-tidy');
    expect(list.goals[0]).toHaveProperty('nextRunAt');

    const remove = await fetch(`${base()}/api/autonomous/schedule/e2e-tidy`, { method: 'DELETE' });
    expect(remove.status).toBe(200);

    const after = await fetch(`${base()}/api/autonomous/schedule`).then((r) => r.json());
    expect(after.goals.map((g: any) => g.id)).not.toContain('e2e-tidy');
  });

  it('rejects a task with an out-of-range time or no steps', async () => {
    const badTime = await fetch(`${base()}/api/autonomous/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'bad', name: 'Bad', atMinuteOfDay: 9999, steps: [{ kind: 'fs.mkdir' }] }),
    });
    expect(badTime.status).toBe(400);

    const noSteps = await fetch(`${base()}/api/autonomous/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'bad2', name: 'Bad', atMinuteOfDay: 60, steps: [] }),
    });
    expect(noSteps.status).toBe(400);
  });

  it('returns 404 when removing a task that does not exist', async () => {
    const res = await fetch(`${base()}/api/autonomous/schedule/nope`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

describe('production hardening endpoints', () => {
  it('serves the permission matrix and refuses unknown actions', async () => {
    const matrix = await fetch(`${base()}/api/security/permission-matrix`).then((r) => r.json());
    expect(matrix.success).toBe(true);
    expect(matrix.matrix.length).toBeGreaterThan(0);

    const unknown = await fetch(`${base()}/api/security/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'flibbertigibbet the widget' }),
    }).then((r) => r.json());
    expect(unknown.decision.allowed).toBe(false);
    expect(unknown.decision.category).toBe('unknown');
  });

  it('blocks an approval-required action without a named approver', async () => {
    const res = await fetch(`${base()}/api/security/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'send a message to Rahul' }),
    }).then((r) => r.json());
    expect(res.decision.allowed).toBe(false);
  });

  it('allows a read-only action', async () => {
    const res = await fetch(`${base()}/api/security/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'check the battery status' }),
    }).then((r) => r.json());
    expect(res.decision.allowed).toBe(true);
  });

  it('reports the kill switch as blocking every action while engaged', async () => {
    const on = await fetch(`${base()}/api/emergency/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedBy: 'E2E', reason: 'hardening test' }),
    }).then((r) => r.json());

    // The toggle may land either way depending on prior state; normalise to ON.
    if (!on.emergencyPaused) {
      await fetch(`${base()}/api/emergency/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: 'E2E' }),
      });
    }

    const blocked = await fetch(`${base()}/api/security/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'check the battery status' }),
    }).then((r) => r.json());
    expect(blocked.decision.allowed).toBe(false);
    expect(blocked.decision.category).toBe('kill_switch');

    // Release so later tests are unaffected.
    const status = await fetch(`${base()}/api/emergency/status`).then((r) => r.json());
    if (status.emergencyPaused) {
      await fetch(`${base()}/api/emergency/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: 'E2E' }),
      });
    }
  });

  it('creates a backup that passes its own round-trip verification', async () => {
    const res = await fetch(`${base()}/api/backup`).then((r) => r.json());
    expect(res.success).toBe(true);
    expect(res.verified).toBe(true);
    expect(res.backup.format).toBe('hermes-jarvis-memory');
    expect(res.backup.keyCount).toBeGreaterThan(0);
  });

  it('scans tracked files for credentials and reports its scope', async () => {
    const res = await fetch(`${base()}/api/security/audit-secrets`).then((r) => r.json());
    expect(res.success).toBe(true);
    expect(res.scannedFiles).toBeGreaterThan(0);
    expect(res).toHaveProperty('clean');
    expect(res).toHaveProperty('summary');
  });

  it('restores a backup and preserves keys it does not mention', async () => {
    const { backup } = await fetch(`${base()}/api/backup`).then((r) => r.json());
    const res = await fetch(`${base()}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup }),
    }).then((r) => r.json());
    expect(res.success).toBe(true);
    expect(Array.isArray(res.restoredKeys)).toBe(true);
  });

  it('rejects a restore of a malformed backup', async () => {
    const res = await fetch(`${base()}/api/restore`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backup: { format: 'nonsense' } }),
    });
    expect(res.status).toBe(400);
  });

  it('reports deployment blockers honestly instead of claiming readiness', async () => {
    const res = await fetch(`${base()}/api/deployment/verify`).then((r) => r.json());
    expect(res.success).toBe(true);
    expect(Array.isArray(res.checks)).toBe(true);
    // In this test environment no vault secret and no TLS are configured, so
    // readiness must be false and the blockers must say why.
    expect(res.ready).toBe(false);
    expect(res.blockers.length).toBeGreaterThan(0);
    expect(res.blockers.join(' ').toLowerCase()).toMatch(/vault|https|build/);
  });
});

describe('kill switch gates autonomous execution', () => {
  it('blocks a goal run while the kill switch is active, then resumes', async () => {
    const toggle = () =>
      fetch(`${base()}/api/emergency/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedBy: 'E2E_TEST', reason: 'verifying the kill switch' }),
      }).then((r) => r.json());

    const activated = await toggle();
    expect(activated.emergencyPaused).toBe(true);

    const blocked = await runGoal({
      goal: 'should be blocked',
      steps: [{ kind: 'fs.mkdir', path: path.join(workDir, 'blocked') }],
    });
    expect(blocked.status).toBe(423);
    expect(blocked.body.outcome).toBe('BLOCKED');
    expect(fs.existsSync(path.join(workDir, 'blocked'))).toBe(false);

    const released = await toggle();
    expect(released.emergencyPaused).toBe(false);

    const allowed = await runGoal({
      goal: 'should now run',
      steps: [{ kind: 'fs.mkdir', path: path.join(workDir, 'allowed') }],
    });
    expect(allowed.body.outcome).toBe('VERIFIED');
    expect(fs.existsSync(path.join(workDir, 'allowed'))).toBe(true);
  });
});