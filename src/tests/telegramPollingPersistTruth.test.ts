import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Item 13 (zero fake success). The Telegram long-polling loop advanced
// `lastTelegramUpdateId` and pushed each processed update into
// `memoryState.processedTelegramUpdates`, then called a bare `persistMemory()`
// whose boolean nobody read. `persistMemory()` returns `false` when the write
// cannot reach disk (read-only volume, full disk), and it returns `true`
// without writing when the file already holds identical bytes. Either way the
// dedup marker lived in memory only: after a restart that never wrote, the
// loop re-fetched and re-processed updates it had already run, re-firing
// commands and approvals. The verdict is now captured on `telegramConfig`
// (`lastPersistFailed`) and named in a warning, so the gap is observable on
// the live status rather than discarded.
//
// server.ts binds a port on import, so the assertions read the source text,
// matching the convention in oauthDisconnectTruth.test.ts.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

/** The startTelegramPolling body up to the next section banner. */
function pollingBlock(): string {
  const start = serverFlat.indexOf('async function startTelegramPolling');
  expect(start, 'startTelegramPolling should exist').toBeGreaterThanOrEqual(0);
  const end = serverFlat.indexOf('===', start);
  return serverFlat.slice(start, end === -1 ? undefined : end);
}

describe('item 13 — the Telegram polling loop honors the processed-marker persist verdict', () => {
  it('captures the persistMemory() boolean instead of discarding it', () => {
    const block = pollingBlock();
    // The verdict must be recorded, not thrown away.
    expect(block).toContain('telegramConfig.lastPersistFailed = !persistMemory();');
    // The discarded-result shape this guard exists to prevent.
    expect(block).not.toMatch(/processedTelegramUpdates\.push\(updateId\);[\s\S]*persistMemory\(\); \}/);
  });

  it('names the durability gap in a warning when the marker write fails', () => {
    const block = pollingBlock();
    expect(block).toContain(
      'Processed-update marker could not be written to durable storage; it may be reprocessed after a restart.'
    );
  });

  it('defaults lastPersistFailed to false so no fabricated saved state is reported', () => {
    expect(serverFlat).toContain('lastPersistFailed: false,');
  });

  it('surfaces the verdict through the existing telegram status route', () => {
    // The status route returns `config: telegramConfig` verbatim, so the new
    // field rides along without a route change; assert that coupling holds.
    expect(serverFlat).toContain("app.get('/api/telegram/status'");
    const statusAt = serverFlat.indexOf("app.get('/api/telegram/status'");
    const next = serverFlat.indexOf('app.', statusAt + 10);
    const route = serverFlat.slice(statusAt, next === -1 ? undefined : next);
    expect(route).toContain('config: telegramConfig');
  });
});
