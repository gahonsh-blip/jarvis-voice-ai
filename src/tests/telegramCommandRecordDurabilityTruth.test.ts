// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `processMobileCommand` (`server.ts`) closed with a bare `persistMemory();`
// statement, discarding the boolean. The exchange it had just recorded — the
// user turn, the reply, the advanced counters and any state the intent changed —
// is only real once it reaches disk, so on a read-only volume or a full disk the
// whole command lived in process memory while `POST /api/telegram/send` answered
// an ordinary success. A delivered reply said nothing about whether the command
// was kept.
//
// The verdict is now bound and returned as `commandRecordPersisted`, and the
// send route names the durability of the record alongside the delivery outcome
// instead of letting a delivered reply imply a durable one.
//
// A real server process runs against a memory file made read-only after the
// first successful write, so the failure path is exercised end to end rather
// than asserted from source text alone.
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

async function send(text: string) {
  const res = await fetch(`${base()}/api/telegram/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return { status: res.status, body: await res.json() };
}

beforeAll(async () => {
  memoryDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-command-record-'));
  memoryFile = path.join(memoryDir, 'memory.json');
  jarvis = startServer();
  await waitForServer(`${base()}/api/memory`);
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

describe('POST /api/telegram/send reports the command record durability honestly', () => {
  it('reports the record as durable while the disk is writable', async () => {
    const { status, body } = await send('JARVIS, server status batao');
    expect(status).toBe(200);
    expect(body.commandRecordPersisted).toBe(true);
    expect(body.recordNote).toBeUndefined();
    // The record verdict is independent of delivery: no Telegram chat is linked
    // in this sandbox, so the reply is honestly undelivered while the record is
    // durable. Both facts are reported, neither is inferred from the other.
    expect(body.delivered).toBe(false);
  });

  it('does not present an unrecorded command as an ordinary success', async () => {
    // The durable write is refused from here on (read-only memory file).
    fs.chmodSync(memoryFile, 0o444);

    const { status, body } = await send('JARVIS, security audit run karo');
    expect(status).toBe(200);
    expect(body.commandRecordPersisted).toBe(false);
    expect(body.recordNote).toContain('durable storage');
    // The reply is still returned — the exchange happened — but the response no
    // longer reads as a fully recorded command.
    expect(body.userMessage).toBeTruthy();
    expect(body.botMessage).toBeTruthy();
  });
});

describe('processMobileCommand consumes its own durability verdict (source guard)', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  const start = source.indexOf('async function processMobileCommand(');
  const end = source.indexOf('async function handleTelegramCallback(');
  const commandBody = source.slice(start, end);

  it('locates the command handler body', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('no longer closes with a discarded persistMemory() statement', () => {
    // The pre-fix shape: `persistMemory();` as a bare statement whose boolean
    // nobody reads. Every call in the handler must now bind its verdict.
    expect(commandBody).not.toMatch(/^\s*persistMemory\(\);\s*$/m);
  });

  it('returns the bound verdict to its callers', () => {
    expect(commandBody).toMatch(/const commandRecordPersisted = persistMemory\(\);/);
    expect(commandBody).toMatch(/return \{[^}]*commandRecordPersisted[^}]*\};/s);
  });

  it('the send route forwards the verdict rather than assuming a record', () => {
    const routeStart = source.indexOf("app.post('/api/telegram/send'");
    const routeEnd = source.indexOf("app.post('/api/telegram/broadcast'");
    const routeBody = source.slice(routeStart, routeEnd);
    expect(routeBody).toMatch(/result\.commandRecordPersisted/);
    expect(routeBody).toMatch(/commandRecordPersisted:\s*recordPersisted/);
    expect(routeBody).toMatch(/recordNote/);
  });
});
