// ==============================================================================
// END-TO-END Android Bridge test.
//
// Boots the real HERMES server process and drives the Android bridge over real
// HTTP exactly as a paired device would. This is the Android -> JARVIS -> server
// -> device leg of the E2E chain.
//
// No mocks: if the server does not authenticate, does not classify capabilities,
// or claims success without device confirmation, these tests fail.
//
// NOTE ON SCOPE: this validates the server side of the bridge contract. It does
// not prove a physical phone was used — see docs/ANDROID_BRIDGE.md for the
// on-device checklist that must be completed on real hardware.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

const PORT = 3321;
const BASE = `http://127.0.0.1:${PORT}`;
const PAIRING_SECRET = 'e2e-pairing-secret-value';
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

function deviceCapabilities(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: 'e2e-pixel-8',
    deviceName: 'E2E Pixel 8',
    model: 'Pixel 8 Pro',
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
    ...overrides,
  };
}

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

async function pair(): Promise<string> {
  const res = await fetch(`${BASE}/api/mobile/bridge/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Jarvis-Pairing-Secret': PAIRING_SECRET },
    body: JSON.stringify({ deviceId: 'e2e-pixel-8' }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`pairing failed: ${JSON.stringify(body)}`);
  return body.sessionToken as string;
}

function authed(token: string) {
  return { 'Content-Type': 'application/json', 'X-Jarvis-Session-Token': token };
}

describe('Android Bridge E2E (real server process)', () => {
  beforeAll(async () => {
    const tsxBin = path.join(ROOT, 'node_modules', '.bin', 'tsx');
    server = spawn(tsxBin, ['server.ts'], {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        NODE_ENV: 'production',
        MOBILE_BRIDGE_PAIRING_SECRET: PAIRING_SECRET,
        MOBILE_BRIDGE_SECRET: 'e2e-bridge-signing-secret',
      },
      stdio: 'ignore',
      // Own process group so afterAll can reap the whole tree; tsx re-executes
      // the script in a child, and killing only the wrapper would orphan it.
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

  // ---- authentication ------------------------------------------------------

  it('refuses bridge access without a session token', async () => {
    const res = await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capabilities: deviceCapabilities() }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.reason).toBe('MALFORMED_TOKEN');
  });

  it('refuses a forged session token', async () => {
    const res = await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: authed('hb1.deadbeefdeadbeefdeadbeef.forged'),
      body: JSON.stringify({ capabilities: deviceCapabilities() }),
    });
    expect(res.status).toBe(401);
    expect((await res.json()).reason).toBe('UNKNOWN_SESSION');
  });

  it('refuses pairing with a wrong pairing secret', async () => {
    const res = await fetch(`${BASE}/api/mobile/bridge/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Jarvis-Pairing-Secret': 'wrong-secret' },
      body: JSON.stringify({ deviceId: 'attacker' }),
    });
    expect(res.status).toBe(403);
  });

  it('reports MOBILE_NOT_CONNECTED before any device registers', async () => {
    const res = await fetch(`${BASE}/api/mobile/bridge/status`);
    const body = await res.json();
    expect(body.status).toBe('MOBILE_NOT_CONNECTED');
    expect(body.deviceLive).toBe(false);
    expect(body.device).toBeNull();
  });

  // ---- full happy path -----------------------------------------------------

  it('runs the full chain: pair -> connect -> heartbeat -> telemetry -> event -> dispatch -> confirm', async () => {
    const token = await pair();
    expect(token.startsWith('hb1.')).toBe(true);

    // 1. Capability handshake
    const connectRes = await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ capabilities: deviceCapabilities(), permissions: grantedPermissions }),
    });
    const connectBody = await connectRes.json();
    expect(connectRes.status).toBe(200);
    expect(connectBody.status).toBe('CONNECTED');
    expect(connectBody.capabilities.unavailable).toEqual([]);

    // 2. Heartbeat carrying real telemetry
    const hbRes = await fetch(`${BASE}/api/mobile/bridge/heartbeat`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        telemetry: {
          battery: { levelPercent: 64, isCharging: false, temperatureC: 30.2 },
          location: { latitude: 28.6139, longitude: 77.209, provider: 'gps', accuracyMeters: 6 },
          notifications: { unreadCount: 4, perPackage: { 'com.whatsapp': 2 } },
        },
      }),
    });
    const hbBody = await hbRes.json();
    expect(hbRes.status).toBe(200);
    expect(hbBody.telemetryAccepted).toEqual({ battery: true, location: true, notifications: true });

    // 3. Device is now genuinely live
    const status = await (await fetch(`${BASE}/api/mobile/bridge/status`)).json();
    expect(status.status).toBe('CONNECTED');
    expect(status.deviceLive).toBe(true);
    expect(status.device.model).toBe('Pixel 8 Pro');

    // 4. Telemetry reads are VERIFIED with device evidence
    const battery = await (await fetch(`${BASE}/api/mobile/bridge/telemetry/battery`)).json();
    expect(battery.outcome).toBe('VERIFIED');
    expect(battery.verified).toBe(true);
    expect(battery.data.levelPercent).toBe(64);
    expect(battery.receipt.evidence.kind).toBe('device_ack');

    const location = await (await fetch(`${BASE}/api/mobile/bridge/telemetry/location`)).json();
    expect(location.outcome).toBe('VERIFIED');
    expect(location.data.latitude).toBeCloseTo(28.6139);

    // 5. An incoming call event is accepted once, and rejected on replay
    const eventBody = {
      eventType: 'INCOMING_CALL',
      payload: { callId: 'call-e2e-1', callerName: 'Rahul Verma', callerNumber: '+919876543210' },
      sequence: 1,
    };
    const ev1 = await fetch(`${BASE}/api/mobile/bridge/event`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify(eventBody),
    });
    expect(ev1.status).toBe(200);

    const replay = await fetch(`${BASE}/api/mobile/bridge/event`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify(eventBody),
    });
    expect(replay.status).toBe(409);
    expect((await replay.json()).reason).toContain('REPLAY_REJECTED');

    // 6. Answer without approval is refused
    const noApproval = await fetch(`${BASE}/api/mobile/bridge/call/answer`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ callId: 'call-e2e-1' }),
    });
    expect(noApproval.status).toBe(403);
    expect((await noApproval.json()).outcome).toBe('BLOCKED');

    // 7. With approval it is DISPATCHED — explicitly not verified
    const answer = await fetch(`${BASE}/api/mobile/bridge/call/answer`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ callId: 'call-e2e-1', approved: true }),
    });
    const answerBody = await answer.json();
    expect(answerBody.outcome).toBe('DISPATCHED');
    expect(answerBody.verified).toBe(false);
    expect(answerBody.dispatchId).toBeTruthy();

    // 8. Only the device's confirmation upgrades it to VERIFIED
    const confirm = await fetch(`${BASE}/api/mobile/bridge/action/confirm`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ dispatchId: answerBody.dispatchId, confirmedStatus: 'CONFIRMED' }),
    });
    const confirmBody = await confirm.json();
    expect(confirm.status).toBe(200);
    expect(confirmBody.outcome).toBe('VERIFIED');
    expect(confirmBody.verified).toBe(true);

    // 9. A replay of the same confirmation is refused
    const reconfirm = await fetch(`${BASE}/api/mobile/bridge/action/confirm`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ dispatchId: answerBody.dispatchId, confirmedStatus: 'CONFIRMED' }),
    });
    expect(reconfirm.status).toBe(409);

    // 10. Audit trail reflects the whole sequence truthfully
    const audit = await (await fetch(`${BASE}/api/mobile/bridge/audit`)).json();
    const events = audit.entries.map((e: any) => e.event);
    expect(events).toContain('PAIRING_ACCEPTED');
    expect(events).toContain('DEVICE_REGISTERED');
    expect(events).toContain('ACTION_DISPATCHED:ANSWER_CALL');
    expect(events).toContain('ACTION_CONFIRMED:ANSWER_CALL');
  }, 90_000);

  // ---- telemetry absence is honest -----------------------------------------

  it('reports telemetry as unverified when the device has not sent it', async () => {
    const token = await pair();
    await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ capabilities: deviceCapabilities(), permissions: grantedPermissions }),
    });

    const battery = await fetch(`${BASE}/api/mobile/bridge/telemetry/battery`);
    expect(battery.status).toBe(404);
    const body = await battery.json();
    expect(body.outcome).toBe('NOT_CONFIGURED');
    expect(body.verified).toBe(false);
    expect(body.data).toBeNull();
    // The old code returned a fabricated 27C / 80% snapshot here.
    expect(JSON.stringify(body)).not.toContain('27');
  }, 60_000);

  it('reports location as PERMISSION_REQUIRED when the device denies it', async () => {
    const token = await pair();
    await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        capabilities: deviceCapabilities(),
        permissions: { ...grantedPermissions, location_access: 'DENIED' },
      }),
    });
    await fetch(`${BASE}/api/mobile/bridge/heartbeat`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ telemetry: {} }),
    });

    const location = await fetch(`${BASE}/api/mobile/bridge/telemetry/location`);
    expect(location.status).toBe(400);
    const body = await location.json();
    expect(body.outcome).toBe('PERMISSION_REQUIRED');
    expect(body.receipt.detailEn).toContain('ACCESS_FINE_LOCATION');
  }, 60_000);

  // ---- reconnect / disconnect ----------------------------------------------

  it('handles disconnect and rejects the revoked session afterwards', async () => {
    const token = await pair();
    await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ capabilities: deviceCapabilities(), permissions: grantedPermissions }),
    });

    const disconnect = await fetch(`${BASE}/api/mobile/bridge/disconnect`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ reason: 'e2e test disconnect' }),
    });
    expect(disconnect.status).toBe(200);

    const status = await (await fetch(`${BASE}/api/mobile/bridge/status`)).json();
    expect(status.status).toBe('MOBILE_NOT_CONNECTED');
    expect(status.reconnect.disconnectCount).toBeGreaterThanOrEqual(1);

    // The revoked token must no longer work.
    const after = await fetch(`${BASE}/api/mobile/bridge/heartbeat`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ telemetry: {} }),
    });
    expect(after.status).toBe(401);
    expect((await after.json()).reason).toBe('SESSION_REVOKED');
  }, 60_000);

  it('lets a re-paired device reconnect and supersedes the old session', async () => {
    const first = await pair();
    await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: authed(first),
      body: JSON.stringify({ capabilities: deviceCapabilities(), permissions: grantedPermissions }),
    });

    // Re-pair (e.g. the phone app was reinstalled) — new session, old one revoked.
    const second = await pair();
    expect(second).not.toBe(first);

    const oldSession = await fetch(`${BASE}/api/mobile/bridge/heartbeat`, {
      method: 'POST',
      headers: authed(first),
      body: JSON.stringify({ telemetry: {} }),
    });
    expect(oldSession.status).toBe(401);

    const reconnected = await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: authed(second),
      body: JSON.stringify({ capabilities: deviceCapabilities(), permissions: grantedPermissions }),
    });
    expect(reconnected.status).toBe(200);
    expect((await reconnected.json()).status).toBe('CONNECTED');
  }, 60_000);

  // ---- capability refusal ---------------------------------------------------

  it('refuses call answering when the device lacks the dialer role, naming the grant', async () => {
    const token = await pair();
    await fetch(`${BASE}/api/mobile/bridge/connect`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({
        capabilities: deviceCapabilities({ telecomRoleDialer: false, answerCallsPermission: false }),
        permissions: grantedPermissions,
      }),
    });

    const answer = await fetch(`${BASE}/api/mobile/bridge/call/answer`, {
      method: 'POST',
      headers: authed(token),
      body: JSON.stringify({ callId: 'call-x', approved: true }),
    });
    expect(answer.status).toBe(403);
    const body = await answer.json();
    expect(body.outcome).toBe('PERMISSION_REQUIRED');
    expect(body.requiredGrant).toBe('ROLE_DIALER');
  }, 60_000);

  // ---- simulation is labelled ----------------------------------------------

  it('labels the simulate endpoint as SIMULATION_ONLY and never connects a device', async () => {
    const before = await (await fetch(`${BASE}/api/mobile/bridge/status`)).json();

    const res = await fetch(`${BASE}/api/mobile/bridge/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'call', callerName: 'Fake Caller' }),
    });
    const body = await res.json();
    expect(body.outcome).toBe('SIMULATION_ONLY');
    expect(body.verified).toBe(false);
    expect(body.simulated).toBe(true);

    // Injecting a synthetic event must not register or reshape any device.
    const after = await (await fetch(`${BASE}/api/mobile/bridge/status`)).json();
    expect(after.deviceLive).toBe(before.deviceLive);
    expect(after.device?.deviceId ?? null).toBe(before.device?.deviceId ?? null);
  }, 60_000);
});
