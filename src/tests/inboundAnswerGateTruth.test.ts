// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// `PHONE_INBOUND_ANSWER` ("Autonomous Inbound Call Answering") is advertised on
// the telephony permission screen, stored in the matrix and served by
// `GET /api/telephony/permissions` — but `POST /api/telephony/incoming`, the
// webhook a carrier calls when the clinic line rings, never read it. It checked
// the webhook signature, checked the emergency stop, and then created a session
// and answered. An operator who set the permission to `DENIED` still had JARVIS
// pick up the phone and greet the caller while the permission screen showed the
// surface as revoked.
//
// This test drives a real `npx tsx server.ts` process against a real permission
// store file: a DENIED matrix must refuse the call (no session created), an
// undecided `ASK` must refuse too, and only an explicit `GRANTED` may answer.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const JARVIS_PORT = 4802;
const BASE = `http://127.0.0.1:${JARVIS_PORT}`;
let jarvis: ChildProcess | undefined;
let tmpDir: string;
let permFile: string;
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
      JARVIS_PHONE_PERMISSIONS_FILE: permFile,
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
}

const postIncoming = (body: Record<string, unknown>) =>
  fetch(`${BASE}/api/telephony/incoming`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isSimulated: true, ...body }),
  });

const setPermission = (state: string) =>
  fetch(`${BASE}/api/telephony/permissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ PHONE_INBOUND_ANSWER: { state } }),
  });

describe('the inbound webhook honours PHONE_INBOUND_ANSWER', () => {
  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-inbound-gate-'));
    permFile = path.join(tmpDir, 'phone_permissions.json');
    memoryFile = path.join(tmpDir, 'jarvis_memory.json');
    // Seed the store with an explicit denial before the server boots.
    fs.writeFileSync(permFile, JSON.stringify({ PHONE_INBOUND_ANSWER: 'DENIED' }), 'utf-8');
    jarvis = startServer();
    await waitForServer(`${BASE}/api/telephony/status`);
  }, 40_000);

  afterAll(async () => {
    await stopServer();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it('refuses to answer while the permission is DENIED, and creates no session', async () => {
    const res = await postIncoming({ From: '+91 98765 00001', To: '+91 90000 00000' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.answered).toBe(false);
    expect(body.outcome).toBe('PERMISSION_DENIED');
    expect(body.permission).toBe('DENIED');
    expect(body.callSessionId).toBeUndefined();

    // The refusal must be real: no call session may exist behind it.
    const status = await (await fetch(`${BASE}/api/telephony/status`)).json();
    expect(status.currentCall).toBeNull();
  });

  it('refuses an undecided ASK rather than reading it as consent', async () => {
    const applied = await setPermission('ASK');
    expect(applied.status).toBe(200);

    const res = await postIncoming({ From: '+91 98765 00002', To: '+91 90000 00000' });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.answered).toBe(false);
    expect(body.outcome).toBe('PERMISSION_UNDECIDED');
    expect(body.permission).toBe('ASK');
  });

  it('answers only once the permission is explicitly GRANTED', async () => {
    const applied = await setPermission('GRANTED');
    const appliedBody = await applied.json();
    expect(applied.status).toBe(200);
    expect(appliedBody.applied).toBe(true);

    const res = await postIncoming({ From: '+91 98765 00003', To: '+91 90000 00000' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.callSessionId).toBe('string');
    expect(body.greeting).toBeTruthy();
  });

  it('refuses a TwiML caller with a hangup response, not an answered call', async () => {
    const applied = await setPermission('DENIED');
    expect(applied.status).toBe(200);

    const res = await fetch(`${BASE}/api/telephony/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        From: '+91 98765 00004',
        To: '+91 90000 00000',
        CallSid: 'CA_test_denied',
      }).toString(),
    });
    expect(res.status).toBe(403);
    const xml = await res.text();
    expect(xml).toContain('<Hangup/>');
    expect(xml).not.toContain('<Gather');
  });
});
