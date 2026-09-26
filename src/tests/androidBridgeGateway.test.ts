// ==============================================================================
// Tests for the Android bridge gateway — the zero-fake-success contract.
//
// The theme of this file: nothing is connected, healthy or successful until a
// real device says so, and the gateway must say NOT_CONFIGURED / DISPATCHED /
// PERMISSION_REQUIRED rather than reaching for a plausible default.
// ==============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AndroidBridgeGateway,
  negotiateCapabilities,
  type DeviceTelemetryInput,
} from '../utils/androidBridgeGateway';
import { BRIDGE_LIVE_TTL_MS } from '../utils/mobileBridgeSession';
import type { AndroidDeviceCapabilities, MobilePermissionMatrix } from '../types/mobileBridge';

const SECRET = 'gateway-test-signing-secret';

function fullCapabilities(isSimulation = false): AndroidDeviceCapabilities {
  return {
    deviceId: 'pixel-8-pro-abc',
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

interface Harness {
  gateway: AndroidBridgeGateway;
  clock: { now: number };
  token: string;
  sessionId: string;
}

function pairedGateway(caps: AndroidDeviceCapabilities = fullCapabilities()): Harness {
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
  return { gateway, clock, token: issued.token, sessionId: issued.session.sessionId };
}

describe('AndroidBridgeGateway — connection truth', () => {
  let gateway: AndroidBridgeGateway;

  beforeEach(() => {
    const clock = { now: 1_000_000_000 };
    gateway = new AndroidBridgeGateway({ signingSecret: SECRET, now: () => clock.now });
  });

  it('reports MOBILE_NOT_CONNECTED before any device registers', () => {
    expect(gateway.getStatus()).toBe('MOBILE_NOT_CONNECTED');
    expect(gateway.getDevice()).toBeNull();
    expect(gateway.isDeviceLive()).toBe(false);
  });

  it('never reports a simulated device as live or CONNECTED', () => {
    const clock = { now: 1_000_000_000 };
    const sim = new AndroidBridgeGateway({ signingSecret: SECRET, now: () => clock.now });
    const issued = sim.issueSession('sim-device');
    const { negotiation } = sim.register({
      sessionId: issued.session.sessionId,
      deviceId: 'sim-device',
      capabilities: fullCapabilities(true),
      permissions: allGranted(),
    });

    expect(negotiation.available).not.toContain('TELEMETRY_BATTERY');
    expect(negotiation.available).not.toContain('TELEMETRY_LOCATION');
    expect(sim.isDeviceLive()).toBe(false);
    expect(sim.getStatus()).toBe('MOBILE_NOT_CONNECTED');
  });

  it('reports CONNECTED only when the device is live and fully capable', () => {
    const { gateway: gw } = pairedGateway();
    expect(gw.isDeviceLive()).toBe(true);
    expect(gw.getStatus()).toBe('CONNECTED');
  });

  it('goes NOT_CONNECTED once the heartbeat window lapses', () => {
    const { gateway: gw, clock } = pairedGateway();
    expect(gw.getStatus()).toBe('CONNECTED');

    clock.now += BRIDGE_LIVE_TTL_MS + 1;
    expect(gw.isDeviceLive()).toBe(false);
    expect(gw.getStatus()).toBe('MOBILE_NOT_CONNECTED');
  });

  it('reports PARTIALLY_CONNECTED when a capability is missing, not CONNECTED', () => {
    const clock = { now: 1_000_000_000 };
    const gw = new AndroidBridgeGateway({ signingSecret: SECRET, now: () => clock.now });
    const issued = gw.issueSession('partial-device');
    const caps = { ...fullCapabilities(), canLookupContacts: false };
    const perms = { ...allGranted(), contacts_lookup: 'DENIED' as const };

    const { negotiation } = gw.register({
      sessionId: issued.session.sessionId,
      deviceId: 'partial-device',
      capabilities: caps,
      permissions: perms,
    });

    expect(negotiation.unavailable).toContain('CONTACTS_LOOKUP');
    expect(gw.getStatus()).toBe('PARTIALLY_CONNECTED');
  });

  it('requires PERMISSION_REQUIRED when nothing is granted', () => {
    const clock = { now: 1_000_000_000 };
    const gw = new AndroidBridgeGateway({ signingSecret: SECRET, now: () => clock.now });
    const issued = gw.issueSession('locked-device');
    const { negotiation } = gw.register({
      sessionId: issued.session.sessionId,
      deviceId: 'locked-device',
      capabilities: { ...fullCapabilities(), canReadNotifications: false, canDetectCalls: false },
      permissions: {},
    });

    expect(gw.getStatus()).toBe('PERMISSION_REQUIRED');
    expect(negotiation.verdicts.find((v) => v.capability === 'CALL_DETECTION')?.requiredGrant).toBe(
      'READ_PHONE_STATE'
    );
  });

  it('tracks reconnect counts and disconnect counts honestly', () => {
    const { gateway: gw, clock, sessionId } = pairedGateway();
    expect(gw.reconnectCount()).toBe(0);

    clock.now += BRIDGE_LIVE_TTL_MS + 1_000;
    const check = gw.verifyToken(gw.getDevice() ? undefined : undefined);
    expect(check.valid).toBe(false);

    gw.revoke(sessionId, 'device went away');
    expect(gw.getDisconnectCount()).toBe(1);
    expect(gw.getStatus()).toBe('MOBILE_NOT_CONNECTED');
  });
});

describe('AndroidBridgeGateway — telemetry truth', () => {
  it('reports NOT_CONFIGURED for telemetry when no device is registered', () => {
    const gw = new AndroidBridgeGateway({ signingSecret: SECRET });
    for (const kind of ['battery', 'location', 'notifications'] as const) {
      const result = gw.readTelemetry(kind);
      expect(result.outcome).toBe('NOT_CONFIGURED');
      expect(result.data).toBeNull();
      expect(result.receipt.verified).toBe(false);
    }
  });

  it('reports PERMISSION_REQUIRED for location until the device grants it', () => {
    const clock = { now: 1_000_000_000 };
    const gw = new AndroidBridgeGateway({ signingSecret: SECRET, now: () => clock.now });
    const issued = gw.issueSession('no-gps');
    gw.register({
      sessionId: issued.session.sessionId,
      deviceId: 'no-gps',
      capabilities: fullCapabilities(),
      permissions: { ...allGranted(), location_access: 'DENIED' },
    });

    const result = gw.readTelemetry('location');
    expect(result.outcome).toBe('PERMISSION_REQUIRED');
    expect(result.data).toBeNull();
    expect(result.receipt.detailEn).toContain('ACCESS_FINE_LOCATION');
  });

  it('does not invent the default 80%/27C values when telemetry is absent', () => {
    const { gateway: gw } = pairedGateway();
    const battery = gw.readTelemetry('battery');
    expect(battery.outcome).toBe('NOT_CONFIGURED');
    expect(battery.data).toBeNull();

    const location = gw.readTelemetry('location');
    expect(location.outcome).toBe('NOT_CONFIGURED');
    expect(location.data).toBeNull();
  });

  it('reports VERIFIED battery only after the device sends real telemetry', () => {
    const { gateway: gw } = pairedGateway();
    gw.heartbeat(gw.getDevice()!.sessionId, {
      battery: { levelPercent: 43, isCharging: true, observedAt: new Date(1_000_000_000).toISOString() },
    });

    const result = gw.readTelemetry('battery');
    expect(result.outcome).toBe('VERIFIED');
    expect(result.receipt.verified).toBe(true);
    expect(result.receipt.evidence?.kind).toBe('device_ack');
    expect((result.data as any).levelPercent).toBe(43);
    expect((result.data as any).isCharging).toBe(true);
  });

  it('clamps impossible battery percentages reported by a device', () => {
    const { gateway: gw } = pairedGateway();
    gw.heartbeat(gw.getDevice()!.sessionId, {
      battery: { levelPercent: 250, isCharging: false },
    });
    const result = gw.readTelemetry('battery');
    expect((result.data as any).levelPercent).toBe(100);
  });

  it('accepts real GPS coordinates and reports them as VERIFIED', () => {
    const { gateway: gw } = pairedGateway();
    const session = gw.getDevice()!.sessionId;
    gw.heartbeat(session, {
      location: { latitude: 28.6139, longitude: 77.209, provider: 'gps', accuracyMeters: 8 },
    });

    const result = gw.readTelemetry('location');
    expect(result.outcome).toBe('VERIFIED');
    expect((result.data as any).latitude).toBeCloseTo(28.6139);
    expect((result.data as any).provider).toBe('gps');
  });

  it('refuses to report stale telemetry from a device that stopped heartbeating', () => {
    const { gateway: gw, clock } = pairedGateway();
    gw.heartbeat(gw.getDevice()!.sessionId, {
      battery: { levelPercent: 55, isCharging: false },
    });
    expect(gw.readTelemetry('battery').outcome).toBe('VERIFIED');

    clock.now += BRIDGE_LIVE_TTL_MS + 1;
    const stale = gw.readTelemetry('battery');
    expect(stale.outcome).toBe('FAILED');
    expect(stale.data).toBeNull();
    expect(stale.receipt.detailEn).toContain('not reachable');
  });

  it('reports notifications telemetry once the listener grants access', () => {
    const { gateway: gw } = pairedGateway();
    gw.heartbeat(gw.getDevice()!.sessionId, {
      notifications: { unreadCount: 7, perPackage: { 'com.whatsapp': 3 } },
    });
    const result = gw.readTelemetry('notifications');
    expect(result.outcome).toBe('VERIFIED');
    expect((result.data as any).unreadCount).toBe(7);
    expect((result.data as any).perPackage['com.whatsapp']).toBe(3);
  });

  it('rejects a heartbeat for a session that does not own the device', () => {
    const { gateway: gw } = pairedGateway();
    const result = gw.heartbeat('some-other-session', { battery: { levelPercent: 1, isCharging: false } });
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('NO_REGISTERED_DEVICE_FOR_SESSION');
  });
});

describe('AndroidBridgeGateway — action dispatch truth', () => {
  it('reports DISPATCHED, never VERIFIED, when an action is handed to the device', () => {
    const { gateway: gw, sessionId } = pairedGateway();
    const { dispatch, receipt } = gw.dispatchAction({
      actionType: 'ANSWER_CALL',
      sessionId,
      target: 'call-123',
      payloadSummary: 'Answer call-123',
    });

    expect(dispatch.status).toBe('DISPATCHED');
    expect(receipt.outcome).toBe('DISPATCHED');
    expect(receipt.verified).toBe(false);
    expect(receipt.dispatchId).toBe(dispatch.dispatchId);
  });

  it('promotes to VERIFIED only on device confirmation', () => {
    const { gateway: gw, sessionId } = pairedGateway();
    const { dispatch } = gw.dispatchAction({
      actionType: 'SEND_REPLY',
      sessionId,
      target: 'notification-9',
      payloadSummary: 'Reply metadata only',
    });

    const receipt = gw.confirmAction({
      dispatchId: dispatch.dispatchId,
      sessionId,
      confirmedStatus: 'CONFIRMED',
      detail: 'RemoteInput delivered',
    });

    expect(receipt.outcome).toBe('VERIFIED');
    expect(receipt.verified).toBe(true);
    expect(receipt.evidence?.kind).toBe('device_ack');
    expect(gw.getDispatch(dispatch.dispatchId)?.status).toBe('CONFIRMED');
  });

  it('keeps a device-reported failure as FAILED', () => {
    const { gateway: gw, sessionId } = pairedGateway();
    const { dispatch } = gw.dispatchAction({
      actionType: 'SEND_REPLY',
      sessionId,
      target: 'notification-9',
      payloadSummary: 'Reply metadata only',
    });

    const receipt = gw.confirmAction({
      dispatchId: dispatch.dispatchId,
      sessionId,
      confirmedStatus: 'FAILED',
      detail: 'RemoteInput action unavailable',
    });

    expect(receipt.outcome).toBe('FAILED');
    expect(receipt.verified).toBe(false);
    expect(receipt.failureReason).toContain('RemoteInput');
  });

  it('refuses a confirmation that arrives on a different session', () => {
    const { gateway: gw, sessionId } = pairedGateway();
    const { dispatch } = gw.dispatchAction({
      actionType: 'ANSWER_CALL',
      sessionId,
      target: 'call-1',
      payloadSummary: 'Answer call-1',
    });

    const receipt = gw.confirmAction({
      dispatchId: dispatch.dispatchId,
      sessionId: 'a-different-session',
      confirmedStatus: 'CONFIRMED',
    });

    expect(receipt.outcome).toBe('BLOCKED');
    expect(receipt.failureReason).toBe('SESSION_MISMATCH');
  });

  it('refuses a confirmation for a dispatch id it never issued', () => {
    const { gateway: gw, sessionId } = pairedGateway();
    const receipt = gw.confirmAction({
      dispatchId: 'disp_deadbeef',
      sessionId,
      confirmedStatus: 'CONFIRMED',
    });
    expect(receipt.outcome).toBe('FAILED');
    expect(receipt.failureReason).toBe('UNKNOWN_DISPATCH_ID');
  });

  it('does not let a dispatch be settled twice', () => {
    const { gateway: gw, sessionId } = pairedGateway();
    const { dispatch } = gw.dispatchAction({
      actionType: 'OPEN_APP',
      sessionId,
      target: 'com.whatsapp',
      payloadSummary: 'Launch whatsapp',
    });

    gw.confirmAction({ dispatchId: dispatch.dispatchId, sessionId, confirmedStatus: 'OK' });
    const second = gw.confirmAction({ dispatchId: dispatch.dispatchId, sessionId, confirmedStatus: 'OK' });
    expect(second.outcome).toBe('FAILED');
    expect(second.failureReason).toBe('ALREADY_SETTLED');
  });

  it('expires unconfirmed dispatches rather than leaving them looking successful', () => {
    const { gateway: gw, clock, sessionId } = pairedGateway();
    gw.dispatchAction({
      actionType: 'ANSWER_CALL',
      sessionId,
      target: 'call-77',
      payloadSummary: 'Answer call-77',
    });

    expect(gw.expireStaleDispatches(60_000)).toBe(0);
    clock.now += 61_000;
    expect(gw.expireStaleDispatches(60_000)).toBe(1);
    expect(gw.getDispatchLedger()[0].status).toBe('EXPIRED');
  });
});

describe('AndroidBridgeGateway — audit trail', () => {
  it('records registration, dispatch and confirmation with honest outcomes', () => {
    const { gateway: gw, sessionId } = pairedGateway();
    const { dispatch } = gw.dispatchAction({
      actionType: 'ANSWER_CALL',
      sessionId,
      target: 'call-5',
      payloadSummary: 'Answer call-5',
    });
    gw.confirmAction({ dispatchId: dispatch.dispatchId, sessionId, confirmedStatus: 'CONFIRMED' });

    const events = gw.getAudit().map((e) => e.event);
    expect(events.some((e) => e.startsWith('SESSION_ISSUED'))).toBe(true);
    expect(events).toContain('DEVICE_REGISTERED');
    expect(events).toContain('ACTION_DISPATCHED:ANSWER_CALL');
    expect(events).toContain('ACTION_CONFIRMED:ANSWER_CALL');

    const confirmedEntry = gw.getAudit().find((e) => e.event === 'ACTION_CONFIRMED:ANSWER_CALL');
    expect(confirmedEntry?.outcome).toBe('VERIFIED');
  });

  it('keeps the audit bounded', () => {
    const clock = { now: 1_000_000_000 };
    const gw = new AndroidBridgeGateway({ signingSecret: SECRET, now: () => clock.now, maxAuditEntries: 5 });
    for (let i = 0; i < 20; i += 1) {
      gw.recordAudit(`EVENT_${i}`, `detail ${i}`, 'VERIFIED');
    }
    expect(gw.getAudit(100).length).toBe(5);
  });

  it('redacts token material in diagnostics', () => {
    const { gateway: gw, token } = pairedGateway();
    const described = gw.describeTokenForDiagnostics(token);
    expect(described).not.toContain(token.split('.')[2]);
  });
});

describe('negotiateCapabilities', () => {
  it('attributes a missing capability to the exact Android grant required', () => {
    const result = negotiateCapabilities(
      { ...fullCapabilities(), canAnswerCalls: true, telecomRoleDialer: false, answerCallsPermission: false },
      allGranted()
    );
    const callAnswer = result.verdicts.find((v) => v.capability === 'CALL_ANSWER');
    expect(callAnswer?.available).toBe(false);
    expect(callAnswer?.requiredGrant).toBe('ROLE_DIALER');
    expect(callAnswer?.reason).toContain('default-dialer');
  });

  it('exposes every capability as a verdict so the UI can explain each gap', () => {
    const result = negotiateCapabilities(fullCapabilities(), allGranted());
    const names = result.verdicts.map((v) => v.capability);
    expect(names).toContain('TELEMETRY_LOCATION');
    expect(names).toContain('CALL_ANSWER');
    expect(names).toContain('INLINE_REPLY');
    expect(result.unavailable).toEqual([]);
  });
});

describe('telemetry typing sanity', () => {
  it('accepts a full telemetry envelope without dropping fields', () => {
    const { gateway: gw } = pairedGateway();
    const envelope: DeviceTelemetryInput = {
      battery: { levelPercent: 91, isCharging: false, temperatureC: 31.5, health: 'GOOD' },
      location: { latitude: -33.8688, longitude: 151.2093, provider: 'fused', accuracyMeters: 12 },
      notifications: { unreadCount: 2 },
    };
    gw.heartbeat(gw.getDevice()!.sessionId, envelope);

    expect((gw.readTelemetry('battery').data as any).temperatureC).toBe(31.5);
    expect((gw.readTelemetry('location').data as any).latitude).toBeCloseTo(-33.8688);
    expect((gw.readTelemetry('notifications').data as any).unreadCount).toBe(2);
  });
});