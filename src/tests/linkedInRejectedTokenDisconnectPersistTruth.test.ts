import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Item 13 (zero fake success). This is the sibling of the expired-token branch
// guarded by linkedInExpiryDisconnectPersistTruth.test.ts. When LinkedIn rejects
// the stored OAuth token mid-publish (AUTH or PERMISSION failure), the publisher
// cleared `oauthConn.connected` and wrote an errorReason, then called a bare
// `persistMemory()` whose boolean nobody read. `persistMemory()` returns false
// when the write cannot reach disk, so the in-memory "disconnected" flag could
// be lost: after a restart the durable state still reported the account as
// connected while the reply had already told the operator to reconnect. The
// verdict is now captured and, when the write fails, the reply names the
// durability gap instead of implying the disconnection was saved.
//
// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in linkedInExpiryDisconnectPersistTruth.test.ts.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

/** The rejected-token branch of publishToLinkedIn up to the retry accounting. */
function rejectedTokenBlock(): string {
  const start = serverFlat.indexOf('// A rejected token must clear the connection');
  expect(start, 'the rejected-token check should exist').toBeGreaterThanOrEqual(0);
  const end = serverFlat.indexOf('const attempts = publishOutcome.attempts.length;', start);
  return serverFlat.slice(start, end === -1 ? undefined : end);
}

describe('item 13 — the LinkedIn rejected-token branch honors the disconnect persist verdict', () => {
  it('captures the persistMemory() boolean instead of discarding it', () => {
    const block = rejectedTokenBlock();
    // The verdict must be recorded, not thrown away.
    expect(block).toContain('rejectedTokenDisconnectPersisted = persistMemory();');
    // The discarded-result shape this guard exists to prevent.
    expect(block).not.toMatch(/Please reconnect\.'; persistMemory\(\); \}/);
  });

  it('names the durability gap in the reply when the disconnect write fails', () => {
    const block = rejectedTokenBlock();
    expect(block).toContain(
      'The rejected-connection marker could not be written to durable storage, so the saved state may still report this account as connected until it is reconnected.'
    );
    // The note is conditional on the write failing; it must not be emitted on a
    // successful persist.
    expect(block).toContain("rejectedTokenDisconnectPersisted ? '' :");
  });

  it('defaults the verdict to persisted when no connection object is held', () => {
    const block = rejectedTokenBlock();
    // With no connection object there is nothing to write, so the branch must
    // not report a durability gap it did not observe.
    expect(block).toContain('let rejectedTokenDisconnectPersisted = true;');
  });

  it('carries the durability note into the AUTH/PERMISSION failure reply', () => {
    const flat = serverFlat;
    expect(flat).toContain('`LinkedIn auth/permission error: ${errDetail}` + rejectedConnectionNote');
    expect(flat).toContain('then reconnect.` + rejectedConnectionNote');
  });
});
