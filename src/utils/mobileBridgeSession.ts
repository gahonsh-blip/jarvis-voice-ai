// ==============================================================================
// HERMES JARVIS — MOBILE BRIDGE SESSION AUTHORITY
//
// Server-side only (imports node:crypto). Do not import from React components.
//
// Every Android bridge request must present a session token that this module
// issued. A bridge that cannot present one is not "connected" — it is an
// unknown caller, and the gateway reports it as such instead of pretending a
// device is linked.
//
// Properties enforced here:
//   * tokens are stored hashed (HMAC), never in plaintext
//   * constant-time comparison on verification
//   * absolute expiry + idle expiry
//   * monotonic per-session sequence numbers (replay rejection)
//   * explicit revocation on disconnect
// ==============================================================================

import crypto from 'node:crypto';
import type { ExecutionOutcome } from './executionTruth';

/** A bridge is considered live if a heartbeat arrived within this window. */
export const BRIDGE_LIVE_TTL_MS = 45 * 1000;
/** Absolute session lifetime, regardless of heartbeats. */
export const SESSION_ABSOLUTE_TTL_MS = 12 * 60 * 60 * 1000;
/** Idle session lifetime — a session with no heartbeat for this long is dead. */
export const SESSION_IDLE_TTL_MS = 5 * 60 * 1000;
/** Events older than this are refused as stale replays. */
export const EVENT_MAX_AGE_MS = 5 * 60 * 1000;
/** Events this far in the future indicate a broken or hostile clock. */
export const EVENT_MAX_FUTURE_MS = 60 * 1000;

export const TOKEN_PREFIX = 'hb1';

export interface BridgeSession {
  sessionId: string;
  deviceId: string;
  /** HMAC of the issued secret. The raw token is never persisted. */
  tokenHash: string;
  issuedAt: number;
  expiresAt: number;
  lastSeenAt: number;
  revoked: boolean;
  revokedAt?: number;
  revokedReason?: string;
  /** Highest event sequence accepted so far; used for replay rejection. */
  lastSequence: number;
  /** Number of times this session was re-attached after an idle gap. */
  reconnectCount: number;
  clientLabel: string;
}

export type SessionCheckReason =
  | 'VALID'
  | 'MALFORMED_TOKEN'
  | 'UNKNOWN_SESSION'
  | 'TOKEN_MISMATCH'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'SESSION_IDLE';

export interface SessionCheckResult {
  valid: boolean;
  reason: SessionCheckReason;
  session?: BridgeSession;
}

function keyFor(secret: string): Buffer {
  return crypto.createHash('sha256').update(`hermes-bridge-session:${secret}`).digest();
}

function hashToken(secret: string, sessionId: string, tokenSecret: string): string {
  return crypto.createHmac('sha256', keyFor(secret)).update(`${sessionId}.${tokenSecret}`).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export interface IssueSessionResult {
  session: BridgeSession;
  /** Returned once at issue time. Not recoverable from the store. */
  token: string;
  expiresAt: string;
}

export class MobileBridgeSessionAuthority {
  private sessions = new Map<string, BridgeSession>();
  private secret: string;
  private now: () => number;

  constructor(secret: string, now: () => number = () => Date.now()) {
    if (!secret || secret.length < 8) {
      throw new Error('Bridge session authority requires a signing secret of at least 8 characters.');
    }
    this.secret = secret;
    this.now = now;
  }

  issueSession(deviceId: string, clientLabel: string = 'Android Bridge'): IssueSessionResult {
    const nowMs = this.now();
    const sessionId = crypto.randomBytes(12).toString('hex');
    const tokenSecret = crypto.randomBytes(32).toString('base64url');
    const token = `${TOKEN_PREFIX}.${sessionId}.${tokenSecret}`;

    const session: BridgeSession = {
      sessionId,
      deviceId,
      tokenHash: hashToken(this.secret, sessionId, tokenSecret),
      issuedAt: nowMs,
      expiresAt: nowMs + SESSION_ABSOLUTE_TTL_MS,
      lastSeenAt: nowMs,
      revoked: false,
      lastSequence: 0,
      reconnectCount: 0,
      clientLabel,
    };

    this.sessions.set(sessionId, session);
    return { session, token, expiresAt: new Date(session.expiresAt).toISOString() };
  }

  /** Parses without validating, so a malformed token is distinguishable from an unknown one. */
  static parseToken(token: string | undefined | null): { sessionId: string; tokenSecret: string } | null {
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().split('.');
    if (parts.length !== 3 || parts[0] !== TOKEN_PREFIX) return null;
    if (!parts[1] || !parts[2]) return null;
    return { sessionId: parts[1], tokenSecret: parts[2] };
  }

  /**
   * Validates a token and (unless `touch` is false) records a heartbeat.
   * Never throws — always returns a reason, so callers can report honestly.
   */
  checkSession(token: string | undefined | null, touch: boolean = true): SessionCheckResult {
    const parsed = MobileBridgeSessionAuthority.parseToken(token);
    if (!parsed) return { valid: false, reason: 'MALFORMED_TOKEN' };

    const session = this.sessions.get(parsed.sessionId);
    if (!session) return { valid: false, reason: 'UNKNOWN_SESSION' };

    const expected = hashToken(this.secret, parsed.sessionId, parsed.tokenSecret);
    if (!timingSafeEqualHex(expected, session.tokenHash)) {
      return { valid: false, reason: 'TOKEN_MISMATCH' };
    }

    if (session.revoked) return { valid: false, reason: 'SESSION_REVOKED', session };

    const nowMs = this.now();
    if (nowMs >= session.expiresAt) return { valid: false, reason: 'SESSION_EXPIRED', session };
    if (nowMs - session.lastSeenAt > SESSION_IDLE_TTL_MS) {
      return { valid: false, reason: 'SESSION_IDLE', session };
    }

    if (touch) this.touchSession(session, nowMs);
    return { valid: true, reason: 'VALID', session };
  }

  private touchSession(session: BridgeSession, nowMs: number): void {
    // A gap larger than the live TTL means the device dropped and came back.
    if (nowMs - session.lastSeenAt > BRIDGE_LIVE_TTL_MS) {
      session.reconnectCount += 1;
    }
    session.lastSeenAt = nowMs;
  }

  revokeSession(sessionId: string, reason: string = 'Client disconnected'): BridgeSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    session.revoked = true;
    session.revokedAt = this.now();
    session.revokedReason = reason;
    return session;
  }

  /**
   * Consumes an event sequence number. Returns false when the event is a replay
   * or arrives outside the acceptable clock window.
   */
  acceptSequence(session: BridgeSession, sequence: unknown, eventTimestamp?: unknown): {
    accepted: boolean;
    reason?: string;
  } {
    if (sequence !== undefined) {
      if (typeof sequence !== 'number' || !Number.isFinite(sequence)) {
        return { accepted: false, reason: 'SEQUENCE_NOT_NUMERIC' };
      }
      if (sequence <= session.lastSequence) {
        return { accepted: false, reason: `REPLAY_REJECTED (sequence ${sequence} <= ${session.lastSequence})` };
      }
      session.lastSequence = sequence;
    }

    if (eventTimestamp !== undefined) {
      const parsed = typeof eventTimestamp === 'number' ? eventTimestamp : Date.parse(String(eventTimestamp));
      if (Number.isNaN(parsed)) return { accepted: false, reason: 'TIMESTAMP_UNPARSEABLE' };
      const nowMs = this.now();
      if (nowMs - parsed > EVENT_MAX_AGE_MS) {
        return { accepted: false, reason: `EVENT_STALE (${Math.round((nowMs - parsed) / 1000)}s old)` };
      }
      if (parsed - nowMs > EVENT_MAX_FUTURE_MS) {
        return { accepted: false, reason: 'EVENT_FROM_FUTURE' };
      }
    }

    return { accepted: true };
  }

  isLive(session: BridgeSession | undefined | null): boolean {
    if (!session) return false;
    if (session.revoked) return false;
    const nowMs = this.now();
    if (nowMs >= session.expiresAt) return false;
    return nowMs - session.lastSeenAt <= BRIDGE_LIVE_TTL_MS;
  }

  getSession(sessionId: string): BridgeSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Test/maintenance hook: drops sessions that can no longer be used. */
  pruneDeadSessions(): number {
    const nowMs = this.now();
    let removed = 0;
    for (const [id, session] of this.sessions.entries()) {
      const dead = session.revoked || nowMs >= session.expiresAt || nowMs - session.lastSeenAt > SESSION_IDLE_TTL_MS;
      if (dead) {
        this.sessions.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  size(): number {
    return this.sessions.size;
  }
}

/** Maps a failed session check onto the truth vocabulary used across the project. */
export function sessionFailureOutcome(reason: SessionCheckReason): ExecutionOutcome {
  switch (reason) {
    case 'SESSION_REVOKED':
    case 'SESSION_EXPIRED':
    case 'SESSION_IDLE':
      return 'FAILED';
    case 'MALFORMED_TOKEN':
    case 'UNKNOWN_SESSION':
    case 'TOKEN_MISMATCH':
      return 'BLOCKED';
    default:
      return 'FAILED';
  }
}

/** Strips a token from anything destined for a log, so secrets never leak. */
export function redactToken(token: string | undefined | null): string {
  const parsed = MobileBridgeSessionAuthority.parseToken(token);
  if (!parsed) return '[no-token]';
  return `${TOKEN_PREFIX}.${parsed.sessionId}.****`;
}
