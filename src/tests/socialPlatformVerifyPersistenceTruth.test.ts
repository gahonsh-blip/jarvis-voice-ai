import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in launchDispatchTruth.test.ts.
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
 * Item 13 (zero fake success). The LinkedIn branch of `testPlatformConnection`
 * cached the verified member profile onto `memoryState.linkedInConnection` and
 * then called `persistMemory()` with the result discarded. On a read-only volume
 * or full disk the cache never reached disk, yet the branch still returned
 * `{ success: true, status: 'VERIFIED' }` and the `/api/social/platforms/test`
 * route relayed it verbatim as `success: true`, so the UI reported a verified,
 * saved profile the next boot would not have. The write result is now honored:
 * the branch assigns `persistMemory()` to `profilePersisted` and the route
 * surfaces `persisted: false` with a durability warning when it is false.
 */
describe('item 13 — the LinkedIn verify does not report a cache that failed to persist', () => {
  it('the verify branch honors the persistMemory() result instead of discarding it', () => {
    const body = platformTesterBody();
    // The profile cache write must be captured, not thrown away.
    expect(body).toContain('const profilePersisted = persistMemory();');
    // And carried on the verified return so the route can gate on it.
    expect(body).toContain('profilePersisted,');
    // The discarded-result shape this guard exists to prevent: the member
    // profile fields were cached and the write result thrown away.
    expect(body).not.toContain('if (memberUrn) conn.authorUrn = memberUrn; persistMemory();');
  });

  it('the verify response declares the persistence outcome for both branches', () => {
    const body = platformTesterBody();
    // The conn-held branch reports the real write result; the no-conn branch
    // expects no write and reports it as persisted.
    expect(body).toContain('profilePersisted,');
    expect(body).toContain('profilePersisted: true,');
  });

  it('the platforms/test route surfaces a failed cache as persisted:false', () => {
    expect(serverFlat).toContain('if (result.profilePersisted === false)');
    expect(serverFlat).toContain('persisted: false,');
    expect(serverFlat).toContain('res.json({ ...result, persisted: true });');
    expect(serverFlat).not.toContain('const result = await testPlatformConnection(platform); res.json(result);');
  });

  it('the tester return type exposes profilePersisted so the route can read it', () => {
    expect(serverFlat).toContain('profilePersisted?: boolean;');
  });
});
