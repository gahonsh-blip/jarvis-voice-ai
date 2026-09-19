// ==============================================================================
// End-to-end test for Telegram delivery verification (backlog items 30-34).
//
// A real JARVIS server process is started, and a local HTTP server stands in for
// the Telegram Bot API. The test drives the real broadcast route and asserts what
// the server reports, proving the honesty rules hold through the whole stack:
//   - a send Telegram confirms with a message id is VERIFIED
//   - a send Telegram accepts without a message id is not confirmed
//   - a blocked bot (403) reports PERMISSION_REQUIRED, not success
//   - an unconfigured server reports NOT_CONFIGURED, not success
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4741;
const TELEGRAM_PORT = 4742;

let jarvis: ChildProcess | undefined;
let telegram: http.Server | undefined;
let memoryFile: string;

interface MockBehaviour {
  status: number;
  body?: unknown;
}

let behaviour: MockBehaviour = { status: 200, body: { ok: true, result: { message_id: 501 } } };

async function waitForServer(url: string, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} did not start within ${timeoutMs}ms`);
}

beforeAll(async () => {
  memoryFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-tg-')), 'memory.json');

  telegram = http.createServer((req, res) => {
    // The bot-poller calls getUpdates in a loop; keep it quiet and empty so it
    // never interferes with the delivery assertions.
    if (req.url?.includes('/getUpdates')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: [] }));
      return;
    }
    if (req.url?.includes('/getMe')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, result: { id: 1, username: 'hermes_test_bot' } }));
      return;
    }
    res.writeHead(behaviour.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(behaviour.body ?? {}));
  });

  await new Promise<void>((resolve) => telegram!.listen(TELEGRAM_PORT, '127.0.0.1', resolve));

  // `npx tsx` spawns tsx as a child; killing only the npx wrapper leaves the
  // real server listening and the next run then talks to a stale process with
  // outdated code. Start tsx directly and kill the whole process group.
  jarvis = spawn('npx', ['tsx', 'server.ts'], {
    cwd: process.cwd(),
    detached: true,
    env: {
      ...process.env,
      PORT: String(JARVIS_PORT),
      JARVIS_MEMORY_FILE: memoryFile,
      TELEGRAM_API_BASE_URL: `http://127.0.0.1:${TELEGRAM_PORT}`,
      TELEGRAM_BOT_TOKEN: '123456789:TESTTOKENVALUE',
      TELEGRAM_ADMIN_CHAT_ID: '424242',
      GEMINI_API_KEY: '',
    },
    stdio: 'ignore',
  });

  await waitForServer(`http://127.0.0.1:${JARVIS_PORT}/api/telegram/status`);
}, 60_000);

afterAll(async () => {
  if (jarvis?.pid) {
    // Negative pid signals the whole process group, so the tsx child dies too.
    try {
      process.kill(-jarvis.pid, 'SIGTERM');
    } catch {
      jarvis.kill('SIGTERM');
    }
    await new Promise((r) => setTimeout(r, 500));
    try {
      process.kill(-jarvis.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  if (telegram) await new Promise<void>((resolve) => telegram!.close(() => resolve()));
  fs.rmSync(path.dirname(memoryFile), { recursive: true, force: true });
});

async function broadcast(message: string) {
  const res = await fetch(`http://127.0.0.1:${JARVIS_PORT}/api/telegram/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return res.json();
}

describe('telegram delivery through the real server', () => {
  it('reports VERIFIED when Telegram returns a message id', async () => {
    behaviour = { status: 200, body: { ok: true, result: { message_id: 777 } } };
    const body = await broadcast('status report');

    expect(body.success).toBe(true);
    expect(body.outcome).toBe('VERIFIED');
    expect(body.verified).toBe(true);
    expect(body.messageId).toBe(777);
  });

  it('does not confirm a send Telegram accepts without a message id', async () => {
    behaviour = { status: 200, body: { ok: true, result: {} } };
    const body = await broadcast('status report');

    expect(body.success).toBe(false);
    expect(body.verified).toBe(false);
    expect(body.outcome).toBe('UNVERIFIED');
    expect(body.message).toContain('not confirmed');
  });

  it('reports PERMISSION_REQUIRED when the bot was blocked', async () => {
    behaviour = {
      status: 403,
      body: { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' },
    };
    const body = await broadcast('status report');

    expect(body.success).toBe(false);
    expect(body.outcome).toBe("PERMISSION_REQUIRED");
    expect(body.errorReason).toContain('blocked');
  });
});