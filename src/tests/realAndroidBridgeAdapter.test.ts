import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  RealAndroidBridgeAdapter,
  simulatedAndroidAdapter,
} from '../utils/androidBridgeAdapter';
import { androidBridgeEngine } from '../utils/androidBridgeEngine';
import { AndroidDeviceCapabilities } from '../types/mobileBridge';

const BASE_URL = process.env.JARVIS_TEST_BASE_URL || 'http://localhost:3000';

const CAPS: AndroidDeviceCapabilities = {
  deviceId: 'pixel_8_pro',
  deviceName: 'Pixel 8 Pro',
  model: 'Pixel 8 Pro',
  osVersion: 'Android 14',
  bridgeVersion: 'HERMES-ANDROID-BRIDGE/2.4.0',
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

/** Rewrites the adapter's relative /api/... URLs onto a concrete origin. */
function withAbsoluteFetch<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: any, init?: any) =>
    original(typeof input === 'string' ? new URL(input, BASE_URL).toString() : input, init)) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

async function serverReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

describe('RealAndroidBridgeAdapter — server contract', () => {
  beforeEach(() => {
    androidBridgeEngine.disconnectDevice();
  });

  afterEach(() => {
    androidBridgeEngine.disconnectDevice();
  });

  it('sends the required device payload so the server accepts the connection', async () => {
    let capturedBody: any = null;
    const original = globalThis.fetch;
    globalThis.fetch = (async (input: any, init?: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: 'Device details required' }),
      } as any;
    }) as typeof fetch;

    try {
      const adapter = new RealAndroidBridgeAdapter();
      adapter.setReportedCapabilities(CAPS);
      await adapter.connect();
    } finally {
      globalThis.fetch = original;
    }

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.device).toBeDefined();
    expect(capturedBody.device.deviceId).toBe('pixel_8_pro');
    expect(capturedBody.device.canAnswerCalls).toBe(true);
  });

  it('maps the server device response back into engine state', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          status: 'CONNECTED',
          device: { ...CAPS, connectedAt: new Date().toISOString() },
        }),
      }) as any) as typeof fetch;

    try {
      const adapter = new RealAndroidBridgeAdapter();
      adapter.setReportedCapabilities(CAPS);
      const result = await adapter.connect();
      expect(result.success).toBe(true);
      expect(result.status).toBe('CONNECTED');
    } finally {
      globalThis.fetch = original;
    }

    expect(androidBridgeEngine.getStatus()).toBe('CONNECTED');
    expect(androidBridgeEngine.getCapabilities()?.model).toBe('Pixel 8 Pro');
  });

  it('surfaces a truthful error instead of a fabricated success when the server rejects', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      ({
        ok: false,
        status: 400,
        json: async () => ({ success: false, error: 'Device details required' }),
      }) as any) as typeof fetch;

    try {
      const adapter = new RealAndroidBridgeAdapter();
      const result = await adapter.connect();
      expect(result.success).toBe(false);
      expect(result.status).toBe('ERROR');
      expect(result.message).toBe('Device details required');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('simulated adapter refuses an unapproved reply', async () => {
    const result = await simulatedAndroidAdapter.sendReply('notif_1', 'ok', false);
    expect(result.success).toBe(false);
    expect(result.status).toBe('AUTHORIZATION_REQUIRED');
  });

  describe('live server integration', () => {
    it('connects the real adapter to the running bridge server', async () => {
      if (!(await serverReachable())) return; // Skip when the daemon is not reachable

      const adapter = new RealAndroidBridgeAdapter();
      adapter.setReportedCapabilities(CAPS);
      const result = await withAbsoluteFetch(() => adapter.connect());

      expect(result.success).toBe(true);
      expect(result.status).toBe('CONNECTED');

      const live = adapter.getCapabilities();
      expect(live?.deviceId).toBe('pixel_8_pro');
    });

    it('live server blocks an unapproved reply and allows an approved one', async () => {
      if (!(await serverReachable())) return;

      const adapter = new RealAndroidBridgeAdapter();
      adapter.setReportedCapabilities(CAPS);
      await withAbsoluteFetch(() => adapter.connect());

      const blocked = await withAbsoluteFetch(() => adapter.sendReply('n1', 'hello', false));
      expect(blocked.success).toBe(false);
      expect(blocked.status).toBe('AUTHORIZATION_REQUIRED');

      const allowed = await withAbsoluteFetch(() => adapter.sendReply('n1', 'hello', true));
      expect(allowed.success).toBe(true);
      expect(allowed.status).toBe('REPLY_CONFIRMED');
    });
  });
});
