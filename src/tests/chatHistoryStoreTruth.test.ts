import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  classifyChatHistoryWrite,
  classifyChatHistoryClear,
  flushChatHistoryNotice,
} from '../utils/hardening/chatHistoryStoreTruth';

// Item 13 (Zero-fake-success). `saveLocalChatHistory` already returned whether
// the write reached `localStorage`, but four App.tsx write sites — three inside a
// deferred `setMessages` updater and one in the persist effect — called it as a
// bare statement. A transcript that never reached storage therefore looked
// identical to a durable one and silently reverted on the next reload. The
// verdict is now classified into a notice the operator can act on.
describe('chat-history durability verdict is classified, not discarded', () => {
  it('a landed write is silent', () => {
    expect(classifyChatHistoryWrite(true)).toEqual({ persisted: true, notice: '' });
  });

  it('a refused write names what was lost and states the reload revert', () => {
    const r = classifyChatHistoryWrite(false, 'Your message');
    expect(r.persisted).toBe(false);
    expect(r.notice).toContain('Your message');
    expect(r.notice).toContain('could NOT be saved to local storage');
    expect(r.notice).toContain('reverts on reload');
  });

  it('an unobserved write is reported as unconfirmed, never as a save', () => {
    for (const unobserved of [null, undefined]) {
      const r = classifyChatHistoryWrite(unobserved, 'This reply');
      expect(r.persisted).toBe(false);
      expect(r.notice).toContain('not confirmed saved');
      expect(r.notice).not.toContain('could NOT be saved');
    }
  });

  it('falls back to a generic target when the label is blank', () => {
    expect(classifyChatHistoryWrite(false, '   ').notice).toContain('This message');
  });
});

describe('deferred chat-history verdict is flushed, not dropped', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('surfaces the refusal on the next tick when the captured write failed', () => {
    vi.useFakeTimers();
    const surfaced: string[] = [];
    let captured: boolean | null = null;
    // Simulate a deferred React state updater: the value is only assigned when
    // the updater runs, after flushChatHistoryNotice has already scheduled.
    flushChatHistoryNotice(() => captured, (n) => surfaced.push(n), 'Your message');
    captured = false;
    vi.runAllTimers();
    expect(surfaced).toHaveLength(1);
    expect(surfaced[0]).toContain('could NOT be saved to local storage');
  });

  it('stays silent when the captured write landed', () => {
    vi.useFakeTimers();
    const surfaced: string[] = [];
    let captured: boolean | null = null;
    flushChatHistoryNotice(() => captured, (n) => surfaced.push(n), 'Your message');
    captured = true;
    vi.runAllTimers();
    expect(surfaced).toHaveLength(0);
  });
});

// Source guards. App.tsx is a large React component the suite does not mount, so
// the write sites are pinned by reading the source, matching the approach the
// offline-persistence and daemon-durability suites already use.
describe('App.tsx no longer discards the chat-history write verdict', () => {
  const fs = require('fs');
  const path = require('path');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

  it('imports the classifier and the deferred flusher', () => {
    expect(appSource).toContain('classifyChatHistoryWrite');
    expect(appSource).toContain('flushChatHistoryNotice');
    expect(appSource).toContain("from './utils/hardening/chatHistoryStoreTruth'");
  });

  it('no bare discard of a chat-history write remains', () => {
    // The pre-fix shape: `saveLocalChatHistory(...)` called as a statement whose
    // boolean was thrown away, on its own line with nothing capturing it.
    expect(appSource).not.toMatch(/\n\s*saveLocalChatHistory\([^)]*\);\n/);
  });

  it('every write site captures the verdict into a variable', () => {
    const captures = appSource.match(/=\s*saveLocalChatHistory\(/g) || [];
    // Four write sites: the persist effect, the jarvis reply, the user message
    // and the backend reply (the fifth site already captured via localWriteLanded).
    expect(captures.length).toBeGreaterThanOrEqual(4);
  });

  it('surfaces the deferred verdicts through the flusher', () => {
    const flushes = appSource.match(/flushChatHistoryNotice\(/g) || [];
    // The call site plus the import — three deferred updater sites flush.
    expect(flushes.length).toBeGreaterThanOrEqual(3);
  });

  it('reports a refused persist-effect write instead of dropping it', () => {
    expect(appSource).toMatch(/classifyChatHistoryWrite\(saveLocalChatHistory\(messages\)/);
  });
});

// Item 13 (Zero-fake-success). The clear-history handler called
// `clearLocalChatHistory()` as a bare statement, then adopted
// `loadLocalChatHistory()`. Because the loader falls back to the seeded
// transcript when the key survives, a refused clear showed a seeded
// conversation and the stored transcript returned on reload with nothing said.
describe('chat-history clear verdict is classified, not discarded', () => {
  it('a landed clear is silent', () => {
    expect(classifyChatHistoryClear(true)).toEqual({ persisted: true, notice: '' });
  });

  it('a refused clear states that the stored transcript remains', () => {
    const r = classifyChatHistoryClear(false);
    expect(r.persisted).toBe(false);
    expect(r.notice).toContain('could NOT be cleared');
    expect(r.notice).toContain('remains');
    expect(r.notice).toContain('reload');
  });

  it('an unobserved clear is reported as unconfirmed, never as a clear', () => {
    for (const unobserved of [null, undefined]) {
      const r = classifyChatHistoryClear(unobserved);
      expect(r.persisted).toBe(false);
      expect(r.notice).toContain('not confirmed');
      expect(r.notice).not.toContain('could NOT be cleared');
    }
  });
});

describe('App.tsx clear-history handler observes the clear result', () => {
  const fs = require('fs');
  const path = require('path');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const appFlat = appSource.replace(/\s+/g, ' ');

  it('captures the clear verdict instead of discarding it', () => {
    expect(appFlat).toMatch(/const cleared = clearLocalChatHistory\(\);/);
  });

  it('no longer calls clearLocalChatHistory as a bare statement', () => {
    expect(appSource).not.toMatch(/\n\s*clearLocalChatHistory\(\);\n/);
  });

  it('surfaces a refused clear through the shared notice', () => {
    expect(appFlat).toContain('classifyChatHistoryClear(cleared)');
  });
});
