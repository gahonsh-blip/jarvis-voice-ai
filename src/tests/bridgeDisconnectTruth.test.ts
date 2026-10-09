// ==============================================================================
// Mobile bridge disconnect truth (backlog item 13).
//
// Unit tests pin `classifyBridgeDisconnect`'s verdicts; the e2e block drives the
// real `server.ts` process over HTTP and proves a real disconnect is reported as
// VERIFIED while the route no longer emits the old unconditional literal.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { classifyBridgeDisconnect } from '../utils/hardening/bridgeDisconnectTruth';

describe('classifyBridgeDisconnect (unit)', () => {
  it('reports VERIFIED only when a real link was dropped and the bridge is down', () => {
    const verdict = classifyBridgeDisconnect({
      deviceWasLinked: true,
      disconnectsBefore: 0,
      disconnectsAfter: 1,
      bridgeStatus: 'MOBILE_NOT_CONNECTED',
      reason: 'operator request',
    });
    expect(verdict.success).toBe(true);
    expect(verdict.verified).toBe(true);
    expect(verdict.outcome).toBe('VERIFIED');
    expect(verdict.status).toBe('MOBILE_NOT_CONNECTED');
    expect(verdict.message).toContain('operator request');
  });

  it('reports PARTIAL when the counter did not advance', () => {
    const verdict = classifyBridgeDisconnect({
      deviceWasLinked: true,
      disconnectsBefore: 3,
      disconnectsAfter: 3,
      bridgeStatus: 'MOBILE_NOT_CONNECTED',
      reason: 'repeat',
    });
    expect(verdict.success).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.outcome).toBe('PARTIAL');
  });

  it('reports PARTIAL when the bridge is still connected after revoke', () => {
    const verdict = classifyBridgeDisconnect({
      deviceWasLinked: true,
      disconnectsBefore: 0,
      disconnectsAfter: 1,
      bridgeStatus: 'CONNECTED',
      reason: 'partial',
    });
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('PARTIAL');
  });

  it('reports FAILED when the session owned no device link', () => {
    const verdict = classifyBridgeDisconnect({
      deviceWasLinked: false,
      disconnectsBefore: 0,
      disconnectsAfter: 0,
      bridgeStatus: 'MOBILE_NOT_CONNECTED',
      reason: 'none',
    });
    expect(verdict.success).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.outcome).toBe('FAILED');
  });
});

describe('bridge disconnect source guard', () => {
  it('no longer emits the unconditional verified literal', () => {
    const server = readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    expect(server).not.toContain("outcome: 'VERIFIED', status: 'MOBILE_NOT_CONNECTED'");
    expect(server).toContain('classifyBridgeDisconnect(');
  });
});

// ---- e2e against the real server process -----------------------------------

const PORT = 3323;
const BASE = `http://127.0.0.1:${PORT}`;
const PAIRING_SECRET = 'e2e-disconnect-pairing-secret';
const ROOT = process.cwd();

let server: ChildProcess | null = null;

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
  throw new Error(`Server did not become healthy on ${BASE} within ${timeoutMs}ms`);
}

const capabilities = {
  deviceId: 'e2e-disconnect-pixel',
  deviceName: 'E2E Disconnect Pixel',
  model: 'Pixel 8',
  osVersion: 'Android 14',
  bridgeVersion: 'HERMES-ANDROID-BRIDGE/3.0.0',
  sdkInt: 34,
  canDetectCalls: true,
  canAnswerCalls: true,
  telecomRoleDialer: true,
  answerCallsPermission: true,
  canReadNotifications: true,
  canInlineReply: true,
  canOpenApp: true,
  canLookupContacts: true,
  isSimulation: false,
};

const grantedPermissions = {
  notification_access: 'GRANTED',
  call_detection: 'GRANTED',
  call_answer: 'GRANTED',
  message_reading: 'GRANTED',
  message_reply: 'GRANTED',
  contacts_lookup: 'GRANTED',
  notification_history: 'GRANTED',
  location_access: 'GRANTED',
};

function authed(token: string) {
  return { 'Content-Type': 'application/json', 'X-Jarvis-Session-Token': token };
}

describe('bridge disconnect e2e (real server process)', () => {
  beforeAll(async () => {
    const tsxBin = path.join(ROOT, 'node_modules', '.bin', 'tsx');
    server = spawn(tsxBin, ['server.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'production',
        MOBILE_BRIDGE_PAIRING_SECRET: PAIRING_SECRET,
        MOBILE_BRIDGE_SECRET: 'e2e-disconnect-signing-secret',
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
        // group already gone
      }
      try {
        server.kill('SIGKILL');
      } catch {
        // already gone
      }
    }
    server = null;
  });

  it('reports a real disconnect as VERIFIED with the observed status', async () => {
    const pair = await fetch(`${BASE}/api/mobile/bridge/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jarvis-Pairing-Secret': PAIRING_SECRET },
      body: JSON.stringify({ deviceId: 'e2e-disconnect-pixel' }),
    });
    const token = (await pair.json()).sessionToken as string;

    const connect = await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ capabilities, permissions: grantedPermissions }),
    });
    expect(connect.ok).toBe(true);

    const disconnect = await fetch(`${BASE}/api/mobile/bridge/disconnect`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ reason: 'e2e teardown' }),
    });
    expect(disconnect.status).toBe(200);
    const body = await disconnect.json();
    expect(body.success).toBe(true);
    expect(body.verified).toBe(true);
    expect(body.outcome).toBe('VERIFIED');
    expect(body.status).toBe('MOBILE_NOT_CONNECTED');
    expect(body.message).toContain('e2e teardown');
  });
});
