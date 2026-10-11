// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `GET /api/autonomous/schedule` reported scheduled-goal runs from an in-memory
// array that was never written to disk. The per-day marker, however, WAS
// persisted, so after a restart the goal did not run again but its run record
// had vanished: the schedule endpoint showed a task with no evidence it had ever
// run. The run record is now mirrored into the memory file and restored on boot.
//
// A real server process runs a due scheduled goal, the record is read back from
// the memory file on disk, and the process is restarted to prove the record
// survives. Source guards pin the wiring so a future edit cannot drop it.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4767;
let jarvis: ChildProcess | undefined;
let memoryDir: string;
let memoryFile: string;
let stepDir: string;
let goalId: string;

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

const base = () => `http://127.0.0.1:${JARVIS_PORT}`;

/** Current minute of day in IST, matching how the server reads the clock. */
function istMinuteOfDay(): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value || '0');
  return value('hour') * 60 + value('minute');
}

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

async function scheduleRuns(): Promise<any[]> {
  const res = await fetch(`${base()}/api/autonomous/schedule`);
  const body = await res.json();
  return Array.isArray(body.runs) ? body.runs : [];
}

/** Records for this run's goal, read from the memory file on disk. */
function runsOnDisk(): any[] {
  const onDisk = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
  const rows = onDisk?.schedulerState?.scheduledGoalRuns;
  return Array.isArray(rows) ? rows : [];
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-schedrun-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  stepDir = path.join(memoryDir, 'sched-step');
  // Unique id so a re-run of the suite is not blocked by a stale per-day marker.
  goalId = `due-goal-${Date.now()}`;
  jarvis = startServer();
  await waitForServer(`${base()}/api/health`);
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

describe('a scheduled goal run is recorded durably and survives a restart', () => {
  it('runs the due goal and writes its run record to the memory file', async () => {
    const res = await fetch(`${base()}/api/autonomous/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: goalId,
        name: 'Durability scheduled probe',
        atMinuteOfDay: istMinuteOfDay(),
        steps: [{ kind: 'fs.mkdir', path: stepDir }],
      }),
    });
    expect(res.status).toBe(201);
    expect((await res.json()).persisted).toBe(true);

    // The scheduler tick fires 30s after boot; poll past that.
    const deadline = Date.now() + 45_000;
    let record: any;
    while (Date.now() < deadline) {
      record = (await scheduleRuns()).find((r) => r.goalId === goalId);
      if (record) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(record).toBeTruthy();
    expect(fs.existsSync(stepDir)).toBe(true);

    // The record is on disk, not only in the running process's memory.
    const onDisk = runsOnDisk().find((r) => r.goalId === goalId);
    expect(onDisk).toBeTruthy();
    expect(onDisk.ranDate).toBe(record.ranDate);
    expect(onDisk.at).toBe(record.at);
  }, 70_000);

  it('restores the run record after the process restarts', async () => {
    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/health`);

    const restored = (await scheduleRuns()).find((r) => r.goalId === goalId);
    expect(restored).toBeTruthy();
    expect(typeof restored.at).toBe('string');
  }, 60_000);
});

describe('scheduled goal run records go through the durable path', () => {
  const tick = serverSource.slice(
    serverSource.indexOf('if (scheduledGoals.length > 0) {'),
    serverSource.indexOf('// Run scheduler tick every 30 seconds')
  );

  it('records every run through recordScheduledGoalRun, never a bare unshift', () => {
    expect(tick).toContain('recordScheduledGoalRun({');
    // The old code pushed records straight into the in-memory array.
    expect(tick).not.toMatch(/scheduledGoalRuns\.unshift\(/);
  });

  it('mirrors the record into the memory file and reads it back before trusting it', () => {
    const helper = serverSource.slice(
      serverSource.indexOf('function recordScheduledGoalRun('),
      serverSource.indexOf('/** Minimal shape check for a persisted goal')
    );
    expect(helper).toContain('memoryState.schedulerState.scheduledGoalRuns');
    expect(helper).toContain('scheduledGoalRunOnDisk(record)');
  });

  it('restores the run history on boot', () => {
    const loader = serverSource.slice(
      serverSource.indexOf('function loadScheduledGoals('),
      serverSource.indexOf('/** Persist the current registry')
    );
    expect(loader).toContain('scheduledGoalRunsOnDisk()');
    expect(loader).toContain('scheduledGoalRuns.push(run)');
  });
});
