import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Item 13 (zero fake success). This is the sibling of the two branches guarded
// by linkedInExpiryDisconnectPersistTruth.test.ts (expired token before publish)
// and linkedInRejectedTokenDisconnectPersistTruth.test.ts (AUTH/PERMISSION
// rejection mid-publish). The third way the stored LinkedIn token dies is the
// `/api/social/platforms/test` verify probe: when the provider answers 401/403,
// `testPlatformConnection('linkedin')` cleared `conn.connected` and wrote an
// errorReason, then called a bare `persistMemory()` whose boolean nobody read.
// `persistMemory()` returns false when the write cannot reach disk, so the
// in-memory "disconnected" flag could be lost: after a restart the durable
// state still reported the account as connected while the probe reply had
// already told the operator the token was dead. The verdict is now captured
// and, when the write fails, the reply names the durability gap instead of
// implying the disconnection was saved.
//
// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in linkedInRejectedTokenDisconnectPersistTruth.test.ts.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

/** The 401/403 branch of testPlatformConnection('linkedin') up to its catch. */
function verifyRejectedTokenBlock(): string {
  const start = serverFlat.indexOf("if (p === 'linkedin') {");
  expect(start, 'the linkedin verify branch should exist').toBeGreaterThanOrEqual(0);
  const end = serverFlat.indexOf("} catch (e: any) {", start);
  return serverFlat.slice(start, end === -1 ? undefined : end);
}

describe('item 13 — the LinkedIn verify probe honors the disconnect persist verdict', () => {
  it('captures the persistMemory() boolean instead of discarding it', () => {
    const block = verifyRejectedTokenBlock();
    // The verdict must be recorded, not thrown away.
    expect(block).toContain('expiredTokenDisconnectPersisted = persistMemory();');
    // The discarded-result shape this guard exists to prevent.
    expect(block).not.toMatch(/errorReason = `LinkedIn returned HTTP \$\{res\.status\}\.[^`]*`; persistMemory\(\); \}/);
  });

  it('names the durability gap in the reply when the disconnect write fails', () => {
    const block = verifyRejectedTokenBlock();
    expect(block).toContain(
      'The expired-connection marker could not be written to durable storage, so the saved state may still report this account as connected until it is reconnected.'
    );
    // The note is conditional on the write failing; it must not be emitted on a
    // successful persist.
    expect(block).toContain("expiredTokenDisconnectPersisted ? '' :");
  });

  it('defaults the verdict to persisted when no connection object is held', () => {
    const block = verifyRejectedTokenBlock();
    // With no connection object there is nothing to write, so the branch must
    // not report a durability gap it did not observe.
    expect(block).toContain('let expiredTokenDisconnectPersisted = true;');
  });

  it('carries the durability note into the probe reply message', () => {
    const block = verifyRejectedTokenBlock();
    expect(block).toContain(
      'Please click "Connect LinkedIn" to reconnect.` + expiredConnectionNote'
    );
  });
});
