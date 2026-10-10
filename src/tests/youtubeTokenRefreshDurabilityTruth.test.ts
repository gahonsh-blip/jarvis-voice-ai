import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in youtubeStatusProbePersistenceTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

/**
 * The `ensureValidYouTubeToken` body, bounded from its declaration to the next
 * top-level `let lastPersistedTimestamp` so the assertions cannot leak into a
 * neighbour.
 */
function tokenHelperBody(): string {
  const start = serverFlat.indexOf('export async function ensureValidYouTubeToken');
  expect(start, 'ensureValidYouTubeToken missing').toBeGreaterThan(-1);
  const rest = serverFlat.slice(start + 1);
  const next = rest.indexOf('let lastPersistedTimestamp');
  expect(next, 'helper boundary missing').toBeGreaterThan(-1);
  return rest.slice(0, next);
}

/**
 * Item 13 (zero fake success). The token-refresh branch of
 * `ensureValidYouTubeToken` set the fresh access token and expiry onto
 * `memoryState.youTubeConnection` and then called `persistMemory()` with the
 * result discarded. On a read-only volume or a full disk the refreshed token
 * never reached `jarvis_memory.json`, yet the helper returned `valid: true` and
 * the caller used a request validity that would be gone on the next boot. The
 * write result is now captured into `refreshPersisted` and returned, with a
 * `refreshPersistenceError` message naming the gap.
 */
describe('item 13 — the YouTube token refresh does not report a refresh that failed to persist', () => {
  it('the refresh branch honors the persistMemory() result instead of discarding it', () => {
    const body = tokenHelperBody();
    // The refreshed-token write must be captured, not thrown away.
    expect(body).toContain('const refreshPersisted = persistMemory();');
    // The discarded-result shape this guard exists to prevent.
    expect(body).not.toContain('persistMemory(); return { valid: true, token: newAccessToken };');
  });

  it('the returned contract carries the durability verdict and a named gap', () => {
    const body = tokenHelperBody();
    expect(body).toContain('return { valid: true, token: newAccessToken, refreshPersisted, refreshPersistenceError:');
    expect(body).toContain('could not be written to durable storage');
  });

  it('the helper signature exposes the durability fields to callers', () => {
    const body = tokenHelperBody();
    expect(body).toContain('refreshPersisted?: boolean; refreshPersistenceError?: string');
  });
});
