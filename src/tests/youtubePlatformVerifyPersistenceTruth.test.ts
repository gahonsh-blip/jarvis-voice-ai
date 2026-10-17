import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in socialPlatformVerifyPersistenceTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

/**
 * The `testPlatformConnection` body, bounded from its declaration to the next
 * top-level `async function` so the assertions cannot leak into a neighbour.
 */
function platformTesterBody(): string {
  const start = serverFlat.indexOf('async function testPlatformConnection(');
  expect(start, 'testPlatformConnection missing').toBeGreaterThan(-1);
  const rest = serverFlat.slice(start + 1);
  const next = rest.indexOf('async function ');
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * The YouTube branch, bounded from `if (p === 'youtube')` to the next platform
 * branch, so the assertion cannot be satisfied by a neighbouring platform.
 */
function youTubeBranch(): string {
  const body = platformTesterBody();
  const start = body.indexOf("if (p === 'youtube')");
  expect(start, 'youtube branch missing').toBeGreaterThan(-1);
  const rest = body.slice(start + 1);
  const next = rest.indexOf("if (p === ");
  return next === -1 ? rest : rest.slice(0, next);
}

/**
 * Item 13 (zero fake success). The YouTube OAuth branch of
 * `testPlatformConnection` cached the verified channel fields onto
 * `memoryState.youTubeConnection` and then called `persistMemory()` with the
 * result discarded. On a read-only volume or full disk the cache never reached
 * disk, yet the branch still returned `{ success: true, status: 'VERIFIED' }`
 * and `/api/social/platforms/test` relayed it verbatim as `success: true`, so
 * the UI reported a verified, saved channel the next boot would not have. The
 * write result is now captured into `profilePersisted` and carried on the
 * verified return, so the route surfaces `persisted: false` when it failed.
 */
describe('item 13 — the YouTube verify does not report a channel cache that failed to persist', () => {
  it('the verify branch honors the persistMemory() result instead of discarding it', () => {
    const body = youTubeBranch();
    // The channel cache write must be captured, not thrown away.
    expect(body).toContain('profilePersisted = persistMemory();');
    // And carried on the verified return so the route can gate on it.
    expect(body).toContain('profilePersisted,');
    // The discarded-result shape this guard exists to prevent: the channel
    // fields were cached and the write result thrown away.
    expect(body).not.toContain('memoryState.youTubeConnection.avatarUrl = avatarUrl; persistMemory();');
    expect(body).not.toContain('memoryState.youTubeConnection.channelId = chId; persistMemory();');
  });

  it('the branch defaults to persisted when no connection object is held', () => {
    const body = youTubeBranch();
    // Coupling the default to the write means a verification with nothing to
    // cache still reports persisted, matching the LinkedIn branch.
    expect(body).toContain('let profilePersisted = true;');
    expect(body).toContain('profilePersisted = persistMemory();');
  });

  it('the platforms/test route surfaces a failed YouTube cache as persisted:false', () => {
    // Shared route gate — a channel cache that did not reach disk must not be
    // relayed as a verified-and-saved connection.
    expect(serverFlat).toContain('if (result.profilePersisted === false)');
    expect(serverFlat).toContain('persisted: false,');
  });
});
