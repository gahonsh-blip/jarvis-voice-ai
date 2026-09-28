import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  telephonyDispatchReply,
  telephonyDispatchVerdict,
} from '../utils/telephonyDispatchTruth';

// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in auditTrailTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

describe('a simulated carrier never confirms a call action', () => {
  it('reports SIMULATION_ONLY and does not claim the call connected', () => {
    const verdict = telephonyDispatchVerdict('answer', 'SIMULATION_ONLY', 'LISTENING');
    expect(verdict.outcome).toBe('SIMULATION_ONLY');
    expect(verdict.actionExecuted).toBe(false);
    expect(verdict.title).toBe('Call Action Not Executed (simulation only)');
    expect(telephonyDispatchReply(verdict.outcome, 'en-US')).not.toMatch(/connected/i);
  });

  it('never reports a hangup as ended under the simulator', () => {
    const verdict = telephonyDispatchVerdict('hangup', 'SIMULATION_ONLY', 'ENDED');
    expect(verdict.actionExecuted).toBe(false);
    expect(verdict.title).not.toBe('Call Ended');
  });
});

describe('dispatch outcomes follow the observed engine mode and session state', () => {
  it('confirms an answer only when the live gateway moved the session to an answered state', () => {
    const verdict = telephonyDispatchVerdict('answer', 'LIVE_GATEWAY', 'LISTENING');
    expect(verdict.outcome).toBe('GATEWAY_CONFIRMED');
    expect(verdict.actionExecuted).toBe(true);
  });

  it('does not confirm an answer while the session is still ringing', () => {
    const verdict = telephonyDispatchVerdict('answer', 'LIVE_GATEWAY', 'RINGING');
    expect(verdict.outcome).toBe('DISPATCHED_AWAITING_GATEWAY');
    expect(verdict.actionExecuted).toBe(false);
    expect(verdict.title).toBe('Call Action Dispatched (unconfirmed)');
  });

  it('does not confirm an answer when no session exists', () => {
    const verdict = telephonyDispatchVerdict('answer', 'LIVE_GATEWAY', null);
    expect(verdict.outcome).toBe('NO_ACTIVE_SESSION');
    expect(verdict.actionExecuted).toBe(false);
  });

  it('confirms a hangup only when the session has actually ended', () => {
    expect(telephonyDispatchVerdict('hangup', 'LIVE_GATEWAY', 'ENDED').actionExecuted).toBe(true);
    expect(telephonyDispatchVerdict('hangup', 'LIVE_GATEWAY', 'LISTENING').actionExecuted).toBe(false);
  });

  it('reports a missing carrier rather than success', () => {
    const verdict = telephonyDispatchVerdict('dial', 'NOT_CONFIGURED', null);
    expect(verdict.outcome).toBe('NO_GATEWAY_CONFIGURED');
    expect(verdict.actionExecuted).toBe(false);
  });

  it('reports a failed call distinctly', () => {
    const verdict = telephonyDispatchVerdict('dial', 'LIVE_GATEWAY', 'FAILED');
    expect(verdict.outcome).toBe('CALL_FAILED');
    expect(verdict.actionExecuted).toBe(false);
  });
});

describe('the voice routes no longer hardcode call success', () => {
  it('routes every call command through the dispatch verdict', () => {
    expect(serverFlat).toContain("evaluateTelephonyDispatch('answer')");
    expect(serverFlat).toContain("evaluateTelephonyDispatch('hangup')");
    expect(serverFlat).toContain("evaluateTelephonyDispatch('reject')");
    expect(serverFlat).toContain("evaluateTelephonyDispatch('dial')");
  });

  it('does not title an unperformed call "Call Connected" or "Call Ended"', () => {
    expect(serverFlat).not.toContain("title: 'Call Connected'");
    expect(serverFlat).not.toContain("title: 'Call Ended'");
    expect(serverFlat).not.toContain("title: 'Call Declined'");
  });
});
