import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyMemoryStoreWrite, classifySyncQueueWrite } from '../utils/hardening/memoryStoreTruth';

// Item 13 (Zero-fake-success). The four Memory Bank handlers in App.tsx wrote
// the local memory copy with a bare `saveLocalMemory(...)` and dropped the
// boolean it returned, so a refused write (quota exceeded, private mode, no
// `localStorage`) still rendered the edit as applied while nothing reached disk.
// These tests pin the helper contract and the wiring in App.tsx.
describe('memory store write verdict', () => {
  it('reports a landed write as saved and silent', () => {
    const result = classifyMemoryStoreWrite(true, 'The name change');
    expect(result.saved).toBe(true);
    expect(result.tone).toBe('success');
    expect(result.notice).toBe('');
  });

  it('reports a refused write with an explicit reload warning', () => {
    const result = classifyMemoryStoreWrite(false, 'The new fact');
    expect(result.saved).toBe(false);
    expect(result.tone).toBe('warn');
    expect(result.notice).toContain('The new fact');
    expect(result.notice).toContain('NOT saved');
    expect(result.notice).toContain('reverts on reload');
  });

  it('never claims a save on a refused write', () => {
    const result = classifyMemoryStoreWrite(false, 'The saved note');
    expect(result.notice.toLowerCase()).not.toContain('was saved to local storage;');
  });
});

describe('App.tsx memory handlers observe the local write', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const appFlat = appSource.replace(/\s+/g, ' ');

  it('imports the truth helper', () => {
    expect(appSource).toContain('classifyMemoryStoreWrite');
    expect(appSource).toContain("from './utils/hardening/memoryStoreTruth'");
  });

  it('gates every memory-store write on the captured result', () => {
    // Four handlers, each with an optimistic write and a post-sync write.
    const wired = appFlat.match(/classifyMemoryStoreWrite\(saveLocalMemory\(/g) || [];
    expect(wired.length).toBeGreaterThanOrEqual(8);
  });

  it('no longer discards the write result in any handler', () => {
    expect(appFlat).not.toContain('setMemory(updatedMemory); saveLocalMemory(updatedMemory);');
    expect(appFlat).not.toContain('setMemory(data.memory); saveLocalMemory(data.memory);');
  });

  it('surfaces the refused write to the operator', () => {
    expect(appSource).toContain('setMemorySaveNotice');
    expect(appSource).toContain('memorySaveNotice');
    expect(appSource).toContain('role="alert"');
  });
});

// Item 13, second slice. When the server write fails, the four handlers fall
// back to `queuePendingSync(...)` so the change can be replayed later. That call
// was a bare statement whose boolean was discarded, so a refused queue (quota,
// private mode, no `localStorage`) left the console reading "queued for sync"
// while the server would never receive the change.
describe('pending-sync queue write verdict', () => {
  it('reports a landed queue as queued and silent', () => {
    const result = classifySyncQueueWrite(true, 'The name change');
    expect(result.queued).toBe(true);
    expect(result.tone).toBe('success');
    expect(result.notice).toBe('');
  });

  it('reports a refused queue with an explicit device-only warning', () => {
    const result = classifySyncQueueWrite(false, 'The new fact');
    expect(result.queued).toBe(false);
    expect(result.tone).toBe('warn');
    expect(result.notice).toContain('The new fact');
    expect(result.notice).toContain('could not be queued');
    expect(result.notice).toContain('stays on this device only');
  });

  it('never claims a refused queue reached the server', () => {
    const result = classifySyncQueueWrite(false, 'The saved note');
    expect(result.notice.toLowerCase()).not.toContain('was queued');
    expect(result.notice).toContain('will not receive');
  });
});

describe('App.tsx offline fallback observes the queue result', () => {
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const appFlat = appSource.replace(/\s+/g, ' ');

  it('gates every offline queue call on the captured result', () => {
    const wired = appFlat.match(/classifySyncQueueWrite\(queuePendingSync\(/g) || [];
    expect(wired.length).toBeGreaterThanOrEqual(4);
  });

  it('no longer discards the queue result in any memory handler', () => {
    expect(appFlat).not.toMatch(/console\.warn\([^)]*\); queuePendingSync\(/);
  });
});
