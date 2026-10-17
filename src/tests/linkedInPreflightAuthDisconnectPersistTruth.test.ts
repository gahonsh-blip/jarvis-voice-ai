import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Item 13 (zero fake success). This is the fourth sibling of the LinkedIn
// disconnect durability guards — the expiry branch
// (linkedInExpiryDisconnectPersistTruth.test.ts), the rejected-token branch
// (linkedInRejectedTokenDisconnectPersistTruth.test.ts) and the verify-probe
// branch (linkedInVerifyDisconnectPersistTruth.test.ts). In `publishToLinkedIn`
// the pre-flight `/v2/userinfo` probe clears `oauthConn.connected` and writes an
// errorReason on a 401/403, then called a bare `persistMemory()` whose boolean
// nobody read. `persistMemory()` returns false when the write cannot reach disk,
// so the in-memory "disconnected" flag could be lost: after a restart the
// durable state still reported the account as connected while the reply had
// already told the operator to reconnect. The verdict is now captured and, when
// the write fails, both the errorReason and the userMessage name the durability
// gap instead of implying the disconnection was saved.
//
// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in the sibling durability tests.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

/** The pre-flight userinfo 401/403 branch of publishToLinkedIn. */
function preflightAuthBlock(): string {
  const start = serverFlat.indexOf('// The pre-flight probe clears the connection');
  expect(start, 'the pre-flight auth-disconnect check should exist').toBeGreaterThanOrEqual(0);
  const end = serverFlat.indexOf('if (!targetAuthor) {', start);
  return serverFlat.slice(start, end === -1 ? undefined : end);
}

describe('item 13 — the LinkedIn pre-flight auth-disconnect branch honors the persist verdict', () => {
  it('captures the persistMemory() boolean instead of discarding it', () => {
    const block = preflightAuthBlock();
    // The verdict must be recorded, not thrown away.
    expect(block).toContain('preflightAuthDisconnectPersisted = persistMemory();');
    // The discarded-result shape this guard exists to prevent.
    expect(block).not.toMatch(/Reconnection required\.'; persistMemory\(\); \}/);
  });

  it('names the durability gap in the reply when the disconnect write fails', () => {
    const block = preflightAuthBlock();
    expect(block).toContain(
      'The rejected-connection marker could not be written to durable storage, so the saved state may still report this account as connected until it is reconnected.'
    );
    // The note is conditional on the write failing; it must not be emitted on a
    // successful persist.
    expect(block).toContain("preflightAuthDisconnectPersisted ? '' :");
  });

  it('defaults the verdict to persisted when no connection object is held', () => {
    const block = preflightAuthBlock();
    // With no connection object there is nothing to write, so the branch must
    // not report a durability gap it did not observe.
    expect(block).toContain('let preflightAuthDisconnectPersisted = true;');
  });

  it('carries the durability note into both the errorReason and the userMessage', () => {
    const block = preflightAuthBlock();
    expect(block).toContain(
      "'LinkedIn authentication failed (HTTP 401/403). Token expired or revoked.' + preflightAuthConnectionNote"
    );
    expect(block).toContain(
      "'❌ AUTHENTICATION ERROR: LinkedIn rejected the token (HTTP 401/403). Please reconnect via the Connect LinkedIn button.' + preflightAuthConnectionNote"
    );
  });
});
