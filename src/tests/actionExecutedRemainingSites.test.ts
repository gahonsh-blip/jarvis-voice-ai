import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { TelephonySessionManager } from '../utils/telephonySessionManager';
import {
  RealAndroidBridgeAdapter,
  simulatedAndroidAdapter,
} from '../utils/androidBridgeAdapter';
import { androidBridgeEngine, AndroidBridgeManager } from '../utils/androidBridgeEngine';
import { AndroidDeviceCapabilities } from '../types/mobileBridge';

// Item 13 ("zero fake success") closed its server.ts sweep and its offline-engine
// sweep in earlier slots. This file pins the last three unaudited `success: true`
// sites that the 02:05 slot named: androidBridgeAdapter.ts, androidBridgeEngine.ts
// and telephonySessionManager.ts. Each site is pinned either as a *truthful* flag
// (the caller did the work the flag claims) or as an *observed defect*.
//
// Audited 2026-10-02 02:35 IST:
//   telephonySessionManager.ts:677/682 — truthful (authorization decision recorded)
//   androidBridgeAdapter.ts:263       — truthful (SIMULATION_ONLY, labelled)
//   androidBridgeEngine.ts:548        — DEFECT (success:true even when the device
//                                       landed in PERMISSION_REQUIRED / LIMITED)

const source = (rel: string) =>
  fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\s+/g, ' ');

// Count only real code sites: a doc comment that merely *mentions* `success: true`
// (e.g. one explaining an old bug) must not be mistaken for a new flag.
const codeOnly = (rel: string) =>
  fs
    .readFileSync(path.resolve(process.cwd(), rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\s+/g, ' ');

describe('Item 13 — remaining success:true sites are enumerated and truthful', () => {
  beforeEach(() => {
    // The bridge engine persists its permission matrix to localStorage; clear it
    // so one test's GRANTED permissions cannot leak into the next.
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('telephony outbound authorization reports success only after recording a real decision', () => {
    const req = TelephonySessionManager.stageOutboundRequest({
      destinationNumber: '+919876543210',
      purpose: 'test',
    });
    expect(req.status).toBe('PENDING_AUTHORIZATION');
    expect(TelephonySessionManager.getPendingOutboundRequests().map((r) => r.id)).toContain(req.id);

    const approved = TelephonySessionManager.authorizeOutboundRequest(req.id, 'APPROVE', 'HUMAN_OPERATOR');
    expect(approved.success).toBe(true);
    expect(approved.request?.status).toBe('AUTHORIZED');
    expect(approved.request?.authorizedBy).toBe('HUMAN_OPERATOR');
    expect(approved.request?.authorizedAt).toBeTruthy();
    // Once decided it leaves the pending queue — success corresponds to state change.
    expect(TelephonySessionManager.getPendingOutboundRequests().map((r) => r.id)).not.toContain(req.id);

    const rejected = TelephonySessionManager.stageOutboundRequest({
      destinationNumber: '+919876543210',
      purpose: 'test',
    });
    const denied = TelephonySessionManager.authorizeOutboundRequest(rejected.id, 'REJECT', 'HUMAN_OPERATOR');
    expect(denied.success).toBe(true);
    expect(denied.request?.status).toBe('REJECTED');

    // Unknown request ids must NOT report success.
    const missing = TelephonySessionManager.authorizeOutboundRequest('req_does_not_exist', 'APPROVE');
    expect(missing.success).toBe(false);
    expect(missing.error).toMatch(/not found/i);
  });

  it('simulated adapter never claims a live device connection', async () => {
    const res = await simulatedAndroidAdapter.connect();
    expect(res.success).toBe(true);
    // Truthfulness is carried by the status, not the flag: a simulation cannot be CONNECTED.
    expect(res.status).not.toBe('CONNECTED');
    expect(res.message).toMatch(/SIMULATION_ONLY/);
  });

  it('real adapter propagates a server rejection instead of reporting success', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ success: false, error: 'Pair the device first' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch;
    try {
      const adapter = new RealAndroidBridgeAdapter();
      const res = await adapter.connect();
      expect(res.success).toBe(false);
      expect(res.status).toBe('ERROR');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('engine connectDevice reports success only for a live, fully-permitted device', () => {
    // Fixed 2026-10-02: the flag previously read true even when the device was
    // downgraded to LIMITED_CAPABILITY or refused with PERMISSION_REQUIRED.
    // A fresh manager avoids the singleton's permission matrix leaking between calls.
    const engine = new AndroidBridgeManager();
    const simCaps: AndroidDeviceCapabilities = {
      deviceId: 'sim',
      deviceName: 'Sim',
      model: 'Sim',
      osVersion: 'Android 14',
      bridgeVersion: 'x',
      canDetectCalls: true,
      canAnswerCalls: true,
      telecomRoleDialer: true,
      answerCallsPermission: true,
      canReadNotifications: true,
      canInlineReply: true,
      canOpenApp: true,
      canLookupContacts: true,
      isSimulation: true,
    };
    // A fresh manager per scenario: connectDevice leaves permission entries it
    // does not re-derive in place, so reusing one engine would carry state over.
    const simRes = new AndroidBridgeManager().connectDevice(simCaps);
    expect(simRes.status).toBe('LIMITED_CAPABILITY');
    expect(simRes.success).toBe(false);

    // A real device with no permissions: status is a refusal, so the flag must be too.
    const noPermCaps: AndroidDeviceCapabilities = { ...simCaps, isSimulation: false, canReadNotifications: false, canDetectCalls: false };
    const permRes = new AndroidBridgeManager().connectDevice(noPermCaps);
    expect(permRes.status).toBe('PERMISSION_REQUIRED');
    expect(permRes.success).toBe(false);

    // A fully-permitted real device is the only case that reports success.
    const liveCaps: AndroidDeviceCapabilities = { ...simCaps, isSimulation: false };
    const liveRes = new AndroidBridgeManager().connectDevice(liveCaps);
    expect(liveRes.status).toBe('CONNECTED');
    expect(liveRes.success).toBe(true);
  });

  it('pins the audited sites so an unaudited flag cannot be added silently', () => {
    const adapter = source('src/utils/androidBridgeAdapter.ts');
    const engine = source('src/utils/androidBridgeEngine.ts');
    const telephony = codeOnly('src/utils/telephonySessionManager.ts');

    // Counts match the 02:05 audit; adding a new flag here must update this test.
    expect((adapter.match(/success: true/g) || []).length).toBe(2);
    // engine.ts no longer hardcodes success — it derives it from the status.
    expect((engine.match(/success: true/g) || []).length).toBe(0);
    expect(engine).toContain("success: this.status === 'CONNECTED'");
    expect((telephony.match(/success: true/g) || []).length).toBe(2);

    // The simulation flag is always accompanied by the SIMULATION_ONLY label.
    expect(adapter).toContain('[SIMULATION_ONLY] Android Virtual Testbed Connected');
  });
});
