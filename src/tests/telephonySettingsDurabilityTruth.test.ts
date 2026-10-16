// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `POST /api/telephony/settings` reported `success: true` and the UI showed
// "SAVED", but the settings lived in a module-local object that was never
// written to `memoryState` or disk. Every saved provider, greeting or voice
// rate silently reverted to the compile-time defaults on the next boot — a
// fake success on the settings surface.
//
// The route now copies the live settings into `memoryState.telephonySettings`
// and runs the durable write, and the boot path restores the saved settings.
// A real server process runs against a temp memory file and is restarted, so
// durability is exercised end to end rather than asserted from source text.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4792;
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

async function saveSettings(body: Record<string, unknown>) {
  const res = await fetch(`${base()}/api/telephony/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function getSettings(): Promise<any> {
  return (await (await fetch(`${base()}/api/telephony/settings`)).json()).settings;
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-telephony-settings-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/telephony/settings`);
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

describe('the telephony settings save reaches disk', () => {
  it('reports a persisted save for a real setting', async () => {
    const res = await saveSettings({ aiReceptionistGreeting: 'Durability probe greeting' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.persisted).toBe(true);
    expect(res.body.changed).toBe(true);
    expect(await getSettings()).toMatchObject({
      aiReceptionistGreeting: 'Durability probe greeting',
    });
  });

  it('writes the setting into the memory file on disk', () => {
    const stored = JSON.parse(fs.readFileSync(memoryFile, 'utf-8'));
    expect(stored.telephonySettings.aiReceptionistGreeting).toBe('Durability probe greeting');
  });

  it('reports a repeat of the stored value as unchanged, not a new save', async () => {
    const res = await saveSettings({ aiReceptionistGreeting: 'Durability probe greeting' });
    expect(res.body.success).toBe(true);
    expect(res.body.changed).toBe(false);
  });
});

describe('the saved telephony settings survive a restart', () => {
  it('restores the greeting written before the restart', async () => {
    await stopServer();
    jarvis = startServer();
    await waitForServer(`${base()}/api/telephony/settings`);

    expect(await getSettings()).toMatchObject({
      aiReceptionistGreeting: 'Durability probe greeting',
    });
  }, 60_000);
});

describe('an unpersistable save is refused, not faked', () => {
  it('answers 500 and rolls the live value back when the disk write fails', async () => {
    const before = (await getSettings()).aiReceptionistGreeting;
    fs.chmodSync(memoryFile, 0o444);

    const res = await saveSettings({ aiReceptionistGreeting: 'must-not-persist' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.persisted).toBe(false);
    expect(res.body.outcome).toBe('NOT_PERSISTED');

    fs.chmodSync(memoryFile, 0o644);
    // The rollback must hold: a change that could not reach disk is not left
    // readable as the live setting.
    expect((await getSettings()).aiReceptionistGreeting).toBe(before);
  });
});

describe('server.ts wires the settings route and boot path to durable storage', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  it('persists the settings in the POST route', () => {
    const start = serverSource.indexOf("app.post('/api/telephony/settings'");
    expect(start).toBeGreaterThan(-1);
    const route = serverSource.slice(start, serverSource.indexOf('// 5. Autonomous Voice Call Turn Processing', start));
    expect(route).toContain('const persisted = persistTelephonySettingsState();');
    expect(route).toContain('NOT_PERSISTED');
  });

  it('restores memoryState.telephonySettings into the live state on boot', () => {
    expect(serverSource).toContain('memoryState.telephonySettings');
    expect(serverSource).toContain('function persistTelephonySettingsState()');
  });
});
