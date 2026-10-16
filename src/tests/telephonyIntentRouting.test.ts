import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import {
  isTelephonyHubRequest,
  isCallHistoryRequest,
  isAnswerCallRequest,
  isHangupCallRequest,
  isRejectCallRequest,
  isTelephonyControlRequest,
} from '../utils/telephonyIntentRouting';
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

// Regression: the "phone call" substring the outbound branch treats as a dial
// trigger also appears inside call-control phrases, so "end phone call" and
// "disconnect phone call" were staged as outbound calls to the default number
// instead of hanging up. The control family must win over the outbound branch.
describe('telephony call-control phrases are not swallowed by the outbound branch', () => {
  beforeEach(() => {
    TelephonyProviderRegistry.setActiveProvider(SIMULATION_PROVIDER_ID);
  });

  const controlCases: Array<[string, string]> = [
    ['end phone call', 'hangup_call'],
    ['end the phone call', 'hangup_call'],
    ['disconnect phone call', 'hangup_call'],
    ['disconnect the phone call', 'hangup_call'],
    ['hang up the phone call', 'hangup_call'],
    ['cut the phone call', 'hangup_call'],
    ['reject phone call', 'reject_call'],
    ['decline the phone call', 'reject_call'],
    ['answer the phone call', 'answer_call'],
    ['pick up the phone call', 'answer_call'],
    ['phone call history', 'call_history'],
    ['phone call log', 'call_history'],
  ];

  it.each(controlCases)('routes "%s" to %s, never an outbound dial', (phrase, intent) => {
    const res = processOfflineCommand(phrase, freshMemory(), 'en-US');
    expect(res.intent, phrase).toBe(intent);
    expect((res.actionDetail as any)?.payload?.target, phrase).toBeUndefined();
  });

  it('the shared control predicate covers every non-dial telephony phrase', () => {
    expect(isAnswerCallRequest('answer the phone call')).toBe(true);
    expect(isHangupCallRequest('disconnect phone call')).toBe(true);
    expect(isRejectCallRequest('reject phone call')).toBe(true);
    expect(isTelephonyControlRequest('end phone call')).toBe(true);
    expect(isTelephonyControlRequest('phone call history')).toBe(true);
    // A genuine dial must never be classified as a control request.
    expect(isTelephonyControlRequest('phone call to Dr Wayne')).toBe(false);
    expect(isTelephonyControlRequest('call Dr Wayne')).toBe(false);
  });

  it('server classifier excludes the control family from the outbound branch', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
    expect(source).toContain('isTelephonyControlRequest(lower)');
    expect(source).toContain('!isTelephonyControlRequest(lower)');
    // The outbound branch must no longer key on the bare "phone call" substring.
    expect(source).not.toMatch(/lower\.includes\('phone call'\)\s*\)\s*\{/);
  });
});
