import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AndroidBridgeGateway } from '../utils/androidBridgeGateway';

// Zero-fake-success guard for `POST /api/mobile/bridge/pair`.
//
// The route answered `success: true, outcome: 'VERIFIED'` as soon as it minted a
// session token — before any device connected or sent a single heartbeat. A
// pairing that has not been followed by a device connect is NOT a verified
// bridge; the bridge status is still MOBILE_NOT_CONNECTED. Minting a token is
// preparation, not execution.

const SECRET = 'pairing-truth-signing-secret';

function freshGateway() {
  const clock = { now: 2_000_000_000 };
  const gateway = new AndroidBridgeGateway({ signingSecret: SECRET, now: () => clock.now });
  return { gateway, clock };
}

describe('a freshly paired bridge is not a connected bridge', () => {
  it('reports MOBILE_NOT_CONNECTED right after a session is issued', () => {
    const { gateway } = freshGateway();
    gateway.issueSession('pixel-8-pro-pair', 'Test Phone');
    expect(gateway.getStatus()).toBe('MOBILE_NOT_CONNECTED');
    expect(gateway.isDeviceLive()).toBe(false);
  });
});

// server.ts binds a port on import, so the route assertion reads the source
// text, matching the convention in bridgeHeartbeatTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

describe('the pairing route no longer claims a verified bridge', () => {
  it('records PAIRING_ACCEPTED with the honest NOT_CONFIGURED outcome', () => {
    expect(serverFlat).toContain("'PAIRING_ACCEPTED'");
    expect(serverFlat).toContain('awaiting device connect and heartbeat');
  });

  it('answers the pair call with success:false / verified:false / NOT_CONFIGURED', () => {
    const pairBlock = serverFlat.slice(
      serverFlat.indexOf("bridgeGateway.issueSession(deviceId, req.body?.clientLabel"),
      serverFlat.indexOf("catch (err: any)", serverFlat.indexOf("bridgeGateway.issueSession(deviceId, req.body?.clientLabel"))
    );
    expect(pairBlock).toContain('success: false');
    expect(pairBlock).toContain("outcome: 'NOT_CONFIGURED'");
    expect(pairBlock).toContain('verified: false');
    // The token is still delivered so the device can proceed.
    expect(pairBlock).toContain('sessionToken: issued.token');
  });

  it('no longer answers the pair call with success:true, outcome:VERIFIED', () => {
    const pairBlock = serverFlat.slice(
      serverFlat.indexOf("bridgeGateway.issueSession(deviceId, req.body?.clientLabel"),
      serverFlat.indexOf("catch (err: any)", serverFlat.indexOf("bridgeGateway.issueSession(deviceId, req.body?.clientLabel"))
    );
    expect(pairBlock).not.toContain("success: true");
    expect(pairBlock).not.toContain("outcome: 'VERIFIED'");
  });
});
