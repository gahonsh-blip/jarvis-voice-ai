import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in youtubeStatusProbePersistenceTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

/**
 * The body of `summarizeYouTubeVideoCore`, bounded from its declaration to the
 * first route that follows it (`/api/tools/youtube/summarize`) so the assertions
 * cannot leak into a neighbour.
 */
function summarizeCoreBody(): string {
  const start = serverFlat.indexOf('async function summarizeYouTubeVideoCore(');
  expect(start, 'summarizeYouTubeVideoCore missing').toBeGreaterThan(-1);
  const rest = serverFlat.slice(start + 1);
  const next = rest.indexOf("app.post('/api/tools/youtube/summarize'");
  expect(next, 'youtube summarize route missing').toBeGreaterThan(-1);
  return rest.slice(0, next);
}

/**
 * Item 13 (zero fake success). `summarizeYouTubeVideoCore` wrote both of its
 * audit rows with `pushAuditEntry(...)` and then called `persistMemory()` with
 * the result discarded. On a read-only volume or full disk the write never
 * reached storage, so the running process held a VERIFIED audit row the next
 * boot did not have — the same discarded-result class fixed for the YouTube
 * status probe in an earlier slot. The rows now go through `recordDurableAuditRow`,
 * which reads the row back from disk and drops a phantom row on failure.
 */
describe('item 13 — the YouTube summarizer audit rows are durable, not discarded', () => {
  it('routes both audit rows through the durable writer', () => {
    const body = summarizeCoreBody();
    const durableWrites = body.match(/recordDurableAuditRow\(/g) || [];
    expect(durableWrites.length).toBe(2);
  });

  it('no longer discards the persist result with a bare pushAuditEntry/persistMemory pair', () => {
    const body = summarizeCoreBody();
    // The discarded-result shape this guard exists to prevent.
    expect(body).not.toContain('pushAuditEntry(');
    expect(body).not.toContain('persistMemory();');
  });

  it('gives each audit row a collision-resistant id', () => {
    const body = summarizeCoreBody();
    // Two rows created in the same millisecond must not share `log-yt-${Date.now()}`.
    expect(body).not.toContain('`log-yt-${Date.now()}`');
    expect(body).toContain('`log-yt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`');
  });
});
