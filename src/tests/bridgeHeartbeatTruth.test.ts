import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  classifyBridgeHeartbeat,
  type HeartbeatTruthInput,
} from '../utils/hardening/bridgeHeartbeatTruth';
import { AndroidBridgeGateway } from '../utils/androidBridgeGateway';
import { BRIDGE_LIVE_TTL_MS } from '../utils/mobileBridgeSession';
import type { AndroidDeviceCapabilities, MobilePermissionMatrix } from '../types/mobileBridge';

// Zero-fake-success guard for `POST /api/mobile/bridge/heartbeat`.
//
// The route answered `success: true, outcome: 'VERIFIED'` for every heartbeat
// the gateway accepted — including a simulated device and a heartbeat whose
// session had already lapsed, so the bridge status read MOBILE_NOT_CONNECTED.
// A heartbeat must be reported as VERIFIED only when a real, live, non-simulated
// device is behind it.

const SECRET = 'heartbeat-truth-signing-secret';

function fullCapabilities(isSimulation = false): AndroidDeviceCapabilities {
  return {
    deviceId: 'pixel-8-pro-hb',
    deviceName: 'Pixel 8 Pro',
    model: 'Pixel 8 Pro',
    osVersion: 'Android 14',
    bridgeVersion: 'HERMES-ANDROID-BRIDGE/3.0.0',
    canDetectCalls: true,
    canAnswerCalls: true,
    telecomRoleDialer: true,
    answerCallsPermission: true,
    canReadNotifications: true,
    canInlineReply: true,
    canOpenApp: true,
    canLookupContacts: true,
    isSimulation,
  };
}

function allGranted(): MobilePermissionMatrix {
  return {
    notification_access: 'GRANTED',
    call_detection: 'GRANTED',
    call_answer: 'GRANTED',
    message_reading: 'GRANTED',
    message_reply: 'GRANTED',
    contacts_lookup: 'GRANTED',
    notification_history: 'GRANTED',
    location_access: 'GRANTED',
  };
}

function pairedGateway(caps: AndroidDeviceCapabilities = fullCapabilities()) {
  const clock = { now: 1_000_000_000 };
  const gateway = new AndroidBridgeGateway({ signingSecret: SECRET, now: () => clock.now });
  const issued = gateway.issueSession(caps.deviceId, 'Test Phone');
  gateway.register({
    sessionId: issued.session.sessionId,
    deviceId: caps.deviceId,
    deviceName: caps.deviceName,
    model: caps.model,
    osVersion: caps.osVersion,
    bridgeVersion: caps.bridgeVersion,
    capabilities: caps,
    permissions: allGranted(),
  });
  return { gateway, clock, sessionId: issued.session.sessionId };
}

// server.ts binds a port on import, so the route assertion reads the source
// text, matching the convention in outboundAuthorizationTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

describe('classifyBridgeHeartbeat never fakes a verified bridge', () => {
  it('reports FAILED when the gateway did not accept the heartbeat', () => {
    const verdict = classifyBridgeHeartbeat({
      accepted: false,
      isSimulation: false,
      bridgeStatus: 'CONNECTED',
      deviceLive: true,
    });
    expect(verdict.success).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.outcome).toBe('FAILED');
  });

  it('reports SIMULATION_ONLY for a simulated device even when tracked live', () => {
    const verdict = classifyBridgeHeartbeat({
      accepted: true,
      isSimulation: true,
      bridgeStatus: 'CONNECTED',
      deviceLive: true,
    });
    expect(verdict.success).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.outcome).toBe('SIMULATION_ONLY');
    expect(verdict.message.toLowerCase()).toContain('simulation');
  });

  it('reports PARTIAL when the bridge did not stay live', () => {
    const verdict = classifyBridgeHeartbeat({
      accepted: true,
      isSimulation: false,
      bridgeStatus: 'MOBILE_NOT_CONNECTED',
      deviceLive: false,
    });
    expect(verdict.success).toBe(false);
    expect(verdict.verified).toBe(false);
    expect(verdict.outcome).toBe('PARTIAL');
  });

  it('reports VERIFIED only for a real, live, non-simulated device', () => {
    const verdict = classifyBridgeHeartbeat({
      accepted: true,
      isSimulation: false,
      bridgeStatus: 'CONNECTED',
      deviceLive: true,
    });
    expect(verdict.success).toBe(true);
    expect(verdict.verified).toBe(true);
    expect(verdict.outcome).toBe('VERIFIED');
  });
});

describe('the heartbeat verdict agrees with the real gateway', () => {
  it('a paired live device yields VERIFIED', () => {
    const { gateway } = pairedGateway();
    const result = gateway.heartbeat(gateway.getDevice()!.sessionId);
    const device = gateway.getDevice();
    const verdict = classifyBridgeHeartbeat({
      accepted: result.accepted,
      isSimulation: Boolean(device?.capabilities.isSimulation),
      bridgeStatus: gateway.getStatus(),
      deviceLive: gateway.isDeviceLive(),
    });
    expect(verdict.outcome).toBe('VERIFIED');
  });

  it('a simulated device yields SIMULATION_ONLY, never VERIFIED — the fixed defect', () => {
    const { gateway } = pairedGateway(fullCapabilities(true));
    const result = gateway.heartbeat(gateway.getDevice()!.sessionId);
    const device = gateway.getDevice();
    const verdict = classifyBridgeHeartbeat({
      accepted: result.accepted,
      isSimulation: Boolean(device?.capabilities.isSimulation),
      bridgeStatus: gateway.getStatus(),
      deviceLive: gateway.isDeviceLive(),
    });
    expect(verdict.outcome).toBe('SIMULATION_ONLY');
    expect(verdict.success).toBe(false);
  });

  it('a heartbeat that did not restore liveness yields PARTIAL', () => {
    const { gateway, clock } = pairedGateway();
    clock.now += BRIDGE_LIVE_TTL_MS + 1;
    const result = gateway.heartbeat(gateway.getDevice()!.sessionId);
    const device = gateway.getDevice();
    const verdict = classifyBridgeHeartbeat({
      accepted: result.accepted,
      isSimulation: Boolean(device?.capabilities.isSimulation),
      bridgeStatus: gateway.getStatus(),
      deviceLive: gateway.isDeviceLive(),
    });
    expect(verdict.outcome).toBe('PARTIAL');
    expect(verdict.success).toBe(false);
  });
});

describe('the heartbeat route no longer answers a blanket VERIFIED', () => {
  it('routes the gateway result through classifyBridgeHeartbeat', () => {
    expect(serverFlat).toContain('classifyBridgeHeartbeat(');
    expect(serverFlat).toContain('success: verdict.success');
    expect(serverFlat).toContain('outcome: verdict.outcome');
    expect(serverFlat).toContain('verified: verdict.verified');
  });

  it('no longer answers success:true, outcome:VERIFIED unconditionally', () => {
    expect(serverFlat).not.toContain("success: true, outcome: 'VERIFIED', status: bridgeGateway.getStatus()");
  });
});
