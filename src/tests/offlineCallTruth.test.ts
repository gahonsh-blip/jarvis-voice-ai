import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import {
  offlineCallVerdict,
  offlineCallReply,
  offlineHumanHandoffReply,
} from '../utils/computerOperator/offlineCallTruth';
import { TelephonyProviderRegistry } from '../utils/telephonyAdapters';
import { SIMULATION_PROVIDER_ID } from '../utils/telephonyGatewayTruth';
import { MemoryStore } from '../types';

// Zero-fake-success guard for the OFFLINE (no-backend) Local JARVIS Engine.
//
// The offline engine narrated telephony work the browser tab never performed:
// `make_call` spoke "Placing outbound call to <number> through carrier gateway",
// `hangup_call` spoke "Terminating active phone call" and titled the action
// "Call Ended", and `answer_call` spoke "Connecting call with caller" and titled
// it "Call Connected". All three returned `actionExecuted: true` and bumped the
// user-visible "Autonomous Actions Executed" counter. The `human_handoff` branch
// promised a transfer to clinic staff whenever a provider was merely configured.
//
// The server voice routes already derive these verdicts from the engine mode and
// the live session (telephonyDispatchTruth.ts). Offline mode holds no gateway
// session, so it can never confirm a carrier action — these tests pin that.

// server.ts binds a port on import, so the source-level guard reads the file
// text, matching the convention in telephonyDispatchTruth.test.ts.
const engineSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/utils/localJarvisEngine.ts'),
  'utf8',
);
// Only the offline telephony section (7.1–7.4). The Android-bridge reject
// branches sit earlier and are tracked separately (items 1/2, hardware-blocked).
const telephonySection = engineSource
  .slice(
    engineSource.indexOf('// 7.1 Telephony & Voice Calling'),
    engineSource.indexOf('// 8. Paint & Canvas'),
  )
  .replace(/\s+/g, ' ');

function freshMemory(): MemoryStore {
  return {
    name: '',
    notes: [],
    customKeyValues: {},
    stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '2026-09-01T00:00:00.000Z' },
  };
}

describe('offline call verdicts never claim carrier work', () => {
  it('never marks an offline call action as executed, in any phase or engine mode', () => {
    const phases = ['dial', 'schedule', 'answer', 'hangup', 'reject'] as const;
    const modes = ['SIMULATION_ONLY', 'NOT_CONFIGURED', 'LIVE_GATEWAY', 'UNSUPPORTED_ENGINE'] as const;
    for (const phase of phases) {
      for (const mode of modes) {
        expect(offlineCallVerdict(phase, mode).actionExecuted).toBe(false);
      }
    }
  });

  it('never reuses the fake-success titles on an offline path', () => {
    const phases = ['dial', 'schedule', 'answer', 'hangup', 'reject'] as const;
    const modes = ['SIMULATION_ONLY', 'NOT_CONFIGURED', 'LIVE_GATEWAY'] as const;
    const banned = ['Call Connected', 'Call Ended', 'Call Declined'];
    for (const phase of phases) {
      for (const mode of modes) {
        const title = offlineCallVerdict(phase, mode).title;
        for (const bad of banned) {
          expect(title).not.toBe(bad);
        }
      }
    }
  });

  it('names the observed reason in the reply and never claims the call connected', () => {
    const sim = offlineCallVerdict('dial', 'SIMULATION_ONLY');
    expect(sim.replyEn).toMatch(/simulation/i);
    // The reply may say "not dialed"; it must never positively claim the call.
    expect(sim.replyEn).toMatch(/not dialed/i);
    expect(sim.replyEn).not.toMatch(/placing outbound call/i);

    const noCarrier = offlineCallVerdict('answer', 'NOT_CONFIGURED');
    expect(noCarrier.replyEn).toMatch(/no telephony carrier is configured/i);
    expect(noCarrier.replyEn).not.toMatch(/connected to|call connected/i);

    // Offline mode cannot reach a live gateway, so even then it does not confirm.
    const live = offlineCallVerdict('hangup', 'LIVE_GATEWAY');
    expect(live.replyEn).toMatch(/offline mode cannot reach the carrier gateway/i);
    expect(live.title).not.toBe('Call Ended');
  });

  it('answers in the requested language', () => {
    expect(offlineCallReply('dial', 'SIMULATION_ONLY', 'hindi')).toBe(
      offlineCallVerdict('dial', 'SIMULATION_ONLY').replyHi,
    );
    expect(offlineCallReply('dial', 'SIMULATION_ONLY', 'hinglish')).toBe(
      offlineCallVerdict('dial', 'SIMULATION_ONLY').replyHinglish,
    );
  });
});

describe('offline human handoff never promises a transfer', () => {
  it('does not claim a transfer even when a provider is configured', () => {
    const reply = offlineHumanHandoffReply(true, 'english');
    expect(reply).toMatch(/no transfer occurred/i);
    expect(reply).not.toMatch(/attempting to transfer|please hold/i);
  });

  it('stays honest when no provider is configured', () => {
    const reply = offlineHumanHandoffReply(false, 'english');
    expect(reply).toMatch(/not reachable/i);
    expect(reply).not.toMatch(/transfer/i);
  });
});

describe('the offline engine does not narrate unperformed calls', () => {
  beforeEach(() => {
    // The simulator's isConfigured() is unconditionally true; that must still
    // not be promoted into a confirmed call by the offline engine.
    TelephonyProviderRegistry.setActiveProvider(SIMULATION_PROVIDER_ID);
  });

  it('does not claim an outbound call was placed', () => {
    const res = processOfflineCommand('call +91 98765 43210', freshMemory(), 'en-US');
    expect(res.intent).toBe('outbound_call_authorization');
    expect(res.actionExecuted).toBe(false);
    expect(res.spokenText).not.toMatch(/placing outbound call/i);
    expect((res.actionDetail as any)?.title).not.toBe('Calling +91 98765 43210');
  });

  it('does not claim an active call was ended', () => {
    const res = processOfflineCommand('end call', freshMemory(), 'en-US');
    expect(res.intent).toBe('hangup_call');
    expect(res.actionExecuted).toBe(false);
    expect((res.actionDetail as any)?.title).not.toBe('Call Ended');
    expect(res.spokenText).not.toMatch(/terminating/i);
  });

  it('does not claim an incoming call was answered', () => {
    const res = processOfflineCommand('answer call', freshMemory(), 'en-US');
    expect(res.intent).toBe('answer_call');
    expect(res.actionExecuted).toBe(false);
    expect((res.actionDetail as any)?.title).not.toBe('Call Connected');
  });

  it('does not claim a scheduled call was placed', () => {
    const res = processOfflineCommand('schedule call tomorrow +91 98765 43210', freshMemory(), 'en-US');
    expect(res.intent).toBe('outbound_call_authorization');
    expect(res.actionExecuted).toBe(false);
    expect((res.actionDetail as any)?.title).not.toMatch(/^Calling/);
  });

  it('does not promise a human transfer on the offline handoff path', () => {
    const res = processOfflineCommand('connect me to staff', freshMemory(), 'en-US');
    expect(res.intent).toBe('human_handoff');
    expect(res.actionExecuted).toBe(false);
    expect(res.spokenText).not.toMatch(/attempting to transfer|please hold/i);
  });
});

describe('the offline engine source no longer hardcodes call success', () => {
  it('derives every offline call branch from offlineCallVerdict', () => {
    expect(telephonySection).toContain("offlineCallVerdict('dial'");
    expect(telephonySection).toContain("offlineCallVerdict('schedule'");
    expect(telephonySection).toContain("offlineCallVerdict('answer'");
    expect(telephonySection).toContain("offlineCallVerdict('hangup'");
    expect(telephonySection).toContain("offlineCallVerdict('reject'");
  });

  it('does not contain the fake-success titles or narration', () => {
    expect(telephonySection).not.toContain("title: 'Call Connected'");
    expect(telephonySection).not.toContain("title: 'Call Ended'");
    expect(telephonySection).not.toContain("title: 'Call Declined'");
    expect(telephonySection).not.toContain('Placing outbound call to');
    expect(telephonySection).not.toContain('Terminating active phone call');
    expect(telephonySection).not.toContain('Connecting call with caller');
  });
});
