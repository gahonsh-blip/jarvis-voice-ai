// ==============================================================================
// Tests for the authenticated Android bridge session authority.
// These assert that the gateway refuses to invent a connection.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import {
  MobileBridgeSessionAuthority,
  BRIDGE_LIVE_TTL_MS,
  SESSION_IDLE_TTL_MS,
  EVENT_MAX_AGE_MS,
  redactToken,
  sessionFailureOutcome,
} from '../utils/mobileBridgeSession';

const SECRET = 'test-signing-secret-value';

function authorityAt(clock: { now: number }) {
  return new MobileBridgeSessionAuthority(SECRET, () => clock.now);
}

describe('MobileBridgeSessionAuthority', () => {
  it('issues a token that verifies, and never stores it in plaintext', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);

    const issued = auth.issueSession('pixel-8', 'Phone');
    expect(issued.token.startsWith('hb1.')).toBe(true);
    expect(issued.session.tokenHash).not.toContain(issued.token);

    const check = auth.checkSession(issued.token);
    expect(check.valid).toBe(true);
    expect(check.reason).toBe('VALID');
    expect(check.session?.deviceId).toBe('pixel-8');
  });

  it('rejects a malformed token distinctly from an unknown session', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);

    expect(auth.checkSession('').reason).toBe('MALFORMED_TOKEN');
    expect(auth.checkSession('garbage').reason).toBe('MALFORMED_TOKEN');
    expect(auth.checkSession('hb1.notarealsession.secret').reason).toBe('UNKNOWN_SESSION');
    expect(auth.checkSession('hb1.abc.def').reason).toBe('UNKNOWN_SESSION');
  });

  it('rejects a token whose secret does not match the session', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);

    const issued = auth.issueSession('pixel-8');
    const parts = issued.token.split('.');
    const forged = `${parts[0]}.${parts[1]}.forged-secret-value`;

    expect(auth.checkSession(forged).reason).toBe('TOKEN_MISMATCH');
  });

  it('rejects a token signed by a different authority secret', () => {
    const clock = { now: 1_000_000 };
    const other = new MobileBridgeSessionAuthority('a-completely-different-secret', () => clock.now);
    const mine = authorityAt(clock);

    const foreign = other.issueSession('intruder');
    // The session id is unknown to `mine`, so it cannot be accepted.
    const check = mine.checkSession(foreign.token);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('UNKNOWN_SESSION');
  });

  it('expires a session after the idle window even with a valid token', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);
    const issued = auth.issueSession('pixel-8');

    clock.now += SESSION_IDLE_TTL_MS + 1;
    const check = auth.checkSession(issued.token);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('SESSION_IDLE');
  });

  it('counts a reconnect when the device returns after a live-window gap', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);
    const issued = auth.issueSession('pixel-8');

    expect(auth.checkSession(issued.token).session?.reconnectCount).toBe(0);

    clock.now += BRIDGE_LIVE_TTL_MS + 5_000;
    const reconnected = auth.checkSession(issued.token);
    expect(reconnected.valid).toBe(true);
    expect(reconnected.session?.reconnectCount).toBe(1);

    // A quick follow-up heartbeat is not another reconnect.
    clock.now += 1_000;
    auth.checkSession(issued.token);
    expect(auth.getSession(issued.session.sessionId)?.reconnectCount).toBe(1);
  });

  it('refuses a revoked session', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);
    const issued = auth.issueSession('pixel-8');

    auth.revokeSession(issued.session.sessionId, 'test disconnect');
    const check = auth.checkSession(issued.token);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('SESSION_REVOKED');
  });

  it('rejects replayed and stale event sequences', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);
    const issued = auth.issueSession('pixel-8');
    const session = issued.session;

    expect(auth.acceptSequence(session, 1).accepted).toBe(true);
    expect(auth.acceptSequence(session, 2).accepted).toBe(true);

    const replay = auth.acceptSequence(session, 2);
    expect(replay.accepted).toBe(false);
    expect(replay.reason).toContain('REPLAY_REJECTED');

    expect(auth.acceptSequence(session, 1).accepted).toBe(false);
    expect(auth.acceptSequence(session, 'not-a-number').accepted).toBe(false);
  });

  it('rejects events that are too old or from the future', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);
    const issued = auth.issueSession('pixel-8');

    const stale = auth.acceptSequence(issued.session, 1, clock.now - EVENT_MAX_AGE_MS - 1_000);
    expect(stale.accepted).toBe(false);
    expect(stale.reason).toContain('EVENT_STALE');

    const future = auth.acceptSequence(issued.session, 2, clock.now + 10 * 60 * 1000);
    expect(future.accepted).toBe(false);
    expect(future.reason).toBe('EVENT_FROM_FUTURE');

    const fresh = auth.acceptSequence(issued.session, 3, clock.now - 1_000);
    expect(fresh.accepted).toBe(true);
  });

  it('prunes dead sessions but keeps live ones', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);
    const live = auth.issueSession('live-device');
    const dying = auth.issueSession('old-device');

    auth.revokeSession(dying.session.sessionId, 'gone');
    expect(auth.pruneDeadSessions()).toBe(1);
    expect(auth.size()).toBe(1);
    expect(auth.getSession(live.session.sessionId)).toBeDefined();
  });

  it('requires a non-trivial signing secret', () => {
    expect(() => new MobileBridgeSessionAuthority('short')).toThrow();
  });

  it('redacts token material for logs', () => {
    const clock = { now: 1_000_000 };
    const auth = authorityAt(clock);
    const issued = auth.issueSession('pixel-8');

    const redacted = redactToken(issued.token);
    expect(redacted).not.toContain(issued.token.split('.')[2]);
    expect(redacted).toContain('****');
    expect(redactToken(undefined)).toBe('[no-token]');
  });

  it('maps session failures onto the truth vocabulary honestly', () => {
    expect(sessionFailureOutcome('SESSION_REVOKED')).toBe('FAILED');
    expect(sessionFailureOutcome('UNKNOWN_SESSION')).toBe('BLOCKED');
    expect(sessionFailureOutcome('TOKEN_MISMATCH')).toBe('BLOCKED');
    expect(sessionFailureOutcome('VALID')).toBe('FAILED');
  });
});
