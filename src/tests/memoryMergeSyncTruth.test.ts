import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// Item 13 (Zero-fake-success). The initial `GET /api/memory` merge path in
// `src/App.tsx` pushes local-only notes up to the server on the next sync. Its
// `queuePendingSync('memory_sync', merged)` call was a bare statement whose
// boolean was discarded, and the follow-up `saveLocalMemory(merged)` result was
// discarded too. A refused queue (quota exceeded, private mode, no
// `localStorage`) still left the status line reading "SYNCING N LOCAL NOTES TO
// SERVER" while the server would never receive them, and a refused local write
// silently reverted on reload. Both verdicts are now captured and the sync
// announcement is gated on the real queue result.
//
// server.ts / App.tsx are React/Express entry modules that bind a port or a
// document on import, so these guards read the source text, matching the
// convention in `memoryStoreWriteTruth.test.ts` and `remainingFakeSuccess.test.ts`.
describe('App.tsx initial memory-merge observes the queue and save results', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const appFlat = appSource.replace(/\s+/g, ' ');

  it('gates the memory_sync queue call on the captured result', () => {
    expect(appFlat).toContain(
      "classifySyncQueueWrite(queuePendingSync('memory_sync', merged),",
    );
  });

  it('no longer discards the memory_sync queue result', () => {
    // The bare statement form the fix removed.
    expect(appFlat).not.toContain("queuePendingSync('memory_sync', merged);");
  });

  it('gates the merged local write on the captured result', () => {
    expect(appFlat).toContain("classifyMemoryStoreWrite(saveLocalMemory(merged), 'The merged memory')");
  });

  it('no longer discards the merged local write result', () => {
    expect(appFlat).not.toContain('saveLocalMemory(merged);');
  });

  it('announces the sync only when the queue actually landed', () => {
    expect(appFlat).toContain('if (localOnlyCount > 0 && syncQueued)');
    expect(appFlat).toContain('SYNCING ${localOnlyCount} LOCAL NOTE');
  });

  it('names a refused queue instead of claiming a sync in progress', () => {
    expect(appFlat).toContain('SYNC QUEUE REFUSED');
    expect(appFlat).toContain('STAY ON THIS DEVICE');
  });

  it('surfaces the captured queue/save notice to the operator', () => {
    expect(appFlat).toContain('if (memorySyncNotice) {');
    expect(appFlat).toContain('setMemorySaveNotice(memorySyncNotice);');
  });
});

describe('App.tsx chat-response memory merge observes the local write', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const appFlat = appSource.replace(/\s+/g, ' ');

  it('gates the chat-response merged local write on the captured result', () => {
    expect(appFlat).toContain("classifyMemoryStoreWrite(saveLocalMemory(merged), 'The synced memory')");
  });

  it('surfaces the chat-response merge notice to the operator', () => {
    expect(appFlat).toContain('if (mergeNotice) {');
    expect(appFlat).toContain('setMemorySaveNotice(mergeNotice);');
  });

  it('no bare saveLocalMemory(merged) statement remains anywhere in App.tsx', () => {
    expect(appFlat).not.toContain('saveLocalMemory(merged);');
  });
});
