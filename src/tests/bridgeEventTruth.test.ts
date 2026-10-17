import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyBridgeEvent } from '../utils/hardening/bridgeEventTruth';

// Regression guard for backlog item 13. `POST /api/mobile/bridge/event`
// answered `{ success: true, outcome: 'VERIFIED', accepted: true }` and stamped
// the audit row `VERIFIED` for every accepted device event — including one from
// a simulated device and one whose session had lapsed. server.ts binds a port on
// import, so the wiring is asserted against the source text and the decision
// logic is exercised directly, matching routineTriggerTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

const live = {
  accepted: true,
  isSimulation: false,
  bridgeStatus: 'CONNECTED' as const,
  deviceLive: true,
  eventType: 'INCOMING_CALL',
};

describe('classifyBridgeEvent reports only a real, live device event as verified', () => {
  it('verifies a live, non-simulated device event', () => {
    const verdict = classifyBridgeEvent(live);
    expect(verdict.success).toBe(true);
    expect(verdict.outcome).toBe('VERIFIED');
    expect(verdict.verified).toBe(true);
  });

  it('never verifies an event from a simulated device, even when the status is CONNECTED', () => {
    const verdict = classifyBridgeEvent({ ...live, isSimulation: true });
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('SIMULATION_ONLY');
    expect(verdict.verified).toBe(false);
  });

  it('reports UNVERIFIED when the bridge is not live', () => {
    const verdict = classifyBridgeEvent({ ...live, deviceLive: false });
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('UNVERIFIED');
    expect(verdict.verified).toBe(false);
  });

  it('reports UNVERIFIED when the bridge status reads MOBILE_NOT_CONNECTED', () => {
    const verdict = classifyBridgeEvent({ ...live, bridgeStatus: 'MOBILE_NOT_CONNECTED' });
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('UNVERIFIED');
  });

  it('reports FAILED when the gateway did not accept the event', () => {
    const verdict = classifyBridgeEvent({ ...live, accepted: false });
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('FAILED');
  });

  it('names the event type in the verified message', () => {
    expect(classifyBridgeEvent(live).message).toContain('INCOMING_CALL');
  });
});

describe('the mobile bridge event route no longer fakes a verified event', () => {
  const route = (() => {
    const start = serverSource.indexOf("app.post('/api/mobile/bridge/event'");
    return serverSource.slice(start, serverSource.indexOf('// ---- 7.', start));
  })();

  it('derives the reply from the classifier', () => {
    expect(route).toContain('classifyBridgeEvent(');
    expect(route).toMatch(/success:\s*eventVerdict\.success/);
    expect(route).toMatch(/outcome:\s*eventVerdict\.outcome/);
  });

  it('stamps the audit rows with the same verdict instead of a blanket VERIFIED', () => {
    expect(route).toContain('eventVerdict.outcome');
    expect(route).not.toContain("'VERIFIED'");
  });

  it('no longer hard-codes success: true on the event reply', () => {
    expect(route).not.toMatch(/success:\s*true/);
  });
});
