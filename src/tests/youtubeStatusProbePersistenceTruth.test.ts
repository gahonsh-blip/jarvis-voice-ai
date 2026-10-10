import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in youtubePlatformVerifyPersistenceTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

/**
 * The `/api/auth/youtube/status` body, bounded from its declaration to the next
 * top-level route (`/api/auth/youtube/disconnect`) so the assertions cannot leak
 * into a neighbour.
 */
function youTubeStatusBody(): string {
  const start = serverFlat.indexOf("app.get('/api/auth/youtube/status'");
  expect(start, 'youtube status route missing').toBeGreaterThan(-1);
  const rest = serverFlat.slice(start + 1);
  const next = rest.indexOf("app.post('/api/auth/youtube/disconnect'");
  expect(next, 'youtube disconnect route missing').toBeGreaterThan(-1);
  return rest.slice(0, next);
}

/**
 * Item 13 (zero fake success). The live-probe branch of
 * `/api/auth/youtube/status` refreshed the cached channel fields onto
 * `memoryState.youTubeConnection` and then called `persistMemory()` with the
 * result discarded. On a read-only volume or full disk the refreshed cache never
 * reached disk, yet the route still answered `connected: true` with no hint the
 * cache was lost. The write result is now captured into `profilePersisted` and
 * carried on the reply, and the message names the durability gap when it failed.
 */
describe('item 13 — the YouTube status probe does not report a refreshed cache that failed to persist', () => {
  it('the probe branch honors the persistMemory() result instead of discarding it', () => {
    const body = youTubeStatusBody();
    // The cache write must be captured, not thrown away.
    expect(body).toContain('profilePersisted = persistMemory();');
    // And carried on the verified reply so a caller can see the gap.
    expect(body).toContain('profilePersisted,');
    // The discarded-result shape this guard exists to prevent.
    expect(body).not.toContain('if (avatarUrl) memoryState.youTubeConnection.avatarUrl = avatarUrl; persistMemory();');
  });

  it('the branch defaults to persisted when no connection object is held', () => {
    const body = youTubeStatusBody();
    // Coupling the default to the write means a verification with nothing to
    // cache still reports persisted, matching the connect/test branches.
    expect(body).toContain('let profilePersisted = true;');
    expect(body).toContain('profilePersisted = persistMemory();');
  });

  it('the reply names the durability gap when the cache write failed', () => {
    const body = youTubeStatusBody();
    expect(body).toContain('profilePersisted ? profileMessage :');
    expect(body).toContain('could not be written to durable storage, so it is not cached');
  });
});
