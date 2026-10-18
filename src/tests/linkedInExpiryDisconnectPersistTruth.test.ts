import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Item 13 (zero fake success). When the stored LinkedIn OAuth token is found to
// be expired, the publisher clears `oauthConn.connected` and writes an
// errorReason, then called a bare `persistMemory()` whose boolean nobody read.
// `persistMemory()` returns false when the write cannot reach disk (read-only
// volume, full disk) and true without writing when the file already holds
// identical bytes. Either way the in-memory "disconnected" flag could be lost:
// after a restart the durable state still reported the account as connected
// while the reply had already told the operator the token was dead. The verdict
// is now captured and, when the write fails, the reply names the durability gap
// instead of implying the disconnection was saved.
//
// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in telegramPollingPersistTruth.test.ts.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

/** The expired-token branch of publishToLinkedIn up to the following try block. */
function expiredTokenBlock(): string {
  const start = serverFlat.indexOf('// Token expiration timestamp check');
  expect(start, 'the expired-token check should exist').toBeGreaterThanOrEqual(0);
  const end = serverFlat.indexOf('try {', start);
  return serverFlat.slice(start, end === -1 ? undefined : end);
}

describe('item 13 — the LinkedIn expiry branch honors the disconnect persist verdict', () => {
  it('captures the persistMemory() boolean instead of discarding it', () => {
    const block = expiredTokenBlock();
    // The verdict must be recorded, not thrown away.
    expect(block).toContain('disconnectPersisted = persistMemory();');
    // The discarded-result shape this guard exists to prevent.
    expect(block).not.toMatch(/errorReason = 'OAuth token expired\. Please reconnect\.'; persistMemory\(\); \}/);
  });

  it('names the durability gap in the reply when the disconnect write fails', () => {
    const block = expiredTokenBlock();
    expect(block).toContain(
      'The expired-connection marker could not be written to durable storage, so the saved state may still report this account as connected until it is reconnected.'
    );
    // The note is conditional on the write failing; it must not be emitted on a
    // successful persist.
    expect(block).toContain("disconnectPersisted ? '' :");
  });

  it('defaults the verdict to persisted when no connection object is held', () => {
    const block = expiredTokenBlock();
    // With no connection object there is nothing to write, so the branch must
    // not report a durability gap it did not observe.
    expect(block).toContain('let disconnectPersisted = true;');
  });
});
