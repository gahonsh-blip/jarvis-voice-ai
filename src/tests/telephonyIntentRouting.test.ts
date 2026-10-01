import { describe, it, expect, beforeEach } from 'vitest';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import { isTelephonyHubRequest, isCallHistoryRequest } from '../utils/telephonyIntentRouting';
import { TelephonyProviderRegistry } from '../utils/telephonyAdapters';
import { SIMULATION_PROVIDER_ID } from '../utils/telephonyGatewayTruth';

// Regression: "call hub" and "call history" both start with (or contain) the
// bare prefix "call ", so a `startsWith('call ')` outbound-call test swallowed
// them. "call hub" staged an outbound call to the literal target "hub" behind a
// Level-4 approval prompt and the telephony console never opened. The shared
// predicates in telephonyIntentRouting.ts are used by both the server
// classifier and the offline engine, so they cannot drift apart again.

function freshMemory(): any {
  return {
    name: 'Test',
    notes: [],
    customKeyValues: {},
    stats: { totalCommands: 0, actionsExecuted: 0, lastActive: new Date().toISOString() },
  };
}

describe('telephony console/history phrase predicates', () => {
  it('recognises console requests and excludes outbound phrasing', () => {
    for (const phrase of ['call hub', 'open dialer', 'open phone', 'phone dialer', 'telephony hub']) {
      expect(isTelephonyHubRequest(phrase), phrase).toBe(true);
    }
    for (const phrase of ['call Dr Wayne', 'call +91 98765 43210', 'dial 911', 'make a call']) {
      expect(isTelephonyHubRequest(phrase), phrase).toBe(false);
    }
  });

  it('recognises history requests and excludes outbound phrasing', () => {
    for (const phrase of ['call history', 'call logs', 'recent calls', 'who called']) {
      expect(isCallHistoryRequest(phrase), phrase).toBe(true);
    }
    for (const phrase of ['call Dr Wayne', 'call +91 98765 43210', 'call hub']) {
      expect(isCallHistoryRequest(phrase), phrase).toBe(false);
    }
  });
});

describe('offline engine routes console/history phrases before outbound dial', () => {
  beforeEach(() => {
    TelephonyProviderRegistry.setActiveProvider(SIMULATION_PROVIDER_ID);
  });

  it('routes "call hub" to the telephony hub, not an outbound call to "hub"', () => {
    const res = processOfflineCommand('call hub', freshMemory(), 'en-US');
    expect(res.intent).toBe('telephony_hub');
    expect(res.actionExecuted).toBe(true);
    expect((res.actionDetail as any)?.target).not.toBe('hub');
  });

  it('routes "call history" to the call history view', () => {
    const res = processOfflineCommand('call history', freshMemory(), 'en-US');
    expect(res.intent).toBe('call_history');
    expect(res.actionExecuted).toBe(true);
  });

  it('still stages a genuine outbound call for human authorization', () => {
    const res = processOfflineCommand('call Dr Wayne', freshMemory(), 'en-US');
    expect(res.intent).toBe('outbound_call_authorization');
    expect(res.actionExecuted).toBe(false);
  });

  it('still stages a numeric outbound call for human authorization', () => {
    const res = processOfflineCommand('call +91 98765 43210', freshMemory(), 'en-US');
    expect(res.intent).toBe('outbound_call_authorization');
    expect(res.actionExecuted).toBe(false);
  });
});
