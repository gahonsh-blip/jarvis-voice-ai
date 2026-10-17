// ==============================================================================
// HERMES JARVIS — CHAT-HISTORY STORE DURABILITY TRUTH (backlog item 13)
//
// `saveLocalChatHistory` reports whether the write reached `localStorage`, and
// `src/utils/offlineStorage.ts` already returns that verdict. Four of the App's
// chat-history write sites still called it as a bare statement — three inside a
// deferred `setMessages` updater and one in the persist effect — so the boolean
// was thrown away. On a full disk, in private mode, or on a host with no
// `localStorage` the reply was never persisted while the transcript stayed on
// screen, and the next reload silently dropped the conversation. Nothing
// distinguished a durable transcript from an ephemeral one.
//
// This module turns the observed verdict into a one-line notice. Only a landed
// write is silent; a refused write names what was lost and states the reload
// revert. It mirrors `memoryStoreTruth.classifyMemoryStoreWrite`.
// ==============================================================================

export interface ChatHistoryWriteNotice {
  /** The boolean `saveLocalChatHistory` actually returned. */
  persisted: boolean;
  /** Full sentence for an inline notice; empty when the write landed. */
  notice: string;
}

/**
 * Turn the real `saveLocalChatHistory` verdict into a notice. `persisted` may be
 * `null`/`undefined` when the write has not been observed yet, which is reported
 * as unconfirmed rather than upgraded to a save.
 */
export function classifyChatHistoryWrite(
  persisted: boolean | null | undefined,
  what = 'This message',
): ChatHistoryWriteNotice {
  const target = what.trim() || 'This message';
  if (persisted === true) return { persisted: true, notice: '' };
  if (persisted === false) {
    return {
      persisted: false,
      notice: `${target} could NOT be saved to local storage; it stays in this session only and the transcript reverts on reload.`,
    };
  }
  return {
    persisted: false,
    notice: `${target} was not confirmed saved to local storage; this transcript may not survive a reload.`,
  };
}

/**
 * Turn the real `clearLocalChatHistory` verdict into a notice. A refused clear
 * leaves the stored transcript in place, and `loadLocalChatHistory` then falls
 * back to the seeded transcript when the key is absent — so adopting the loaded
 * value unconditionally showed a seeded conversation and hid the refusal.
 */
export function classifyChatHistoryClear(persisted: boolean | null | undefined): ChatHistoryWriteNotice {
  if (persisted === true) return { persisted: true, notice: '' };
  if (persisted === false) {
    return {
      persisted: false,
      notice: 'The chat history could NOT be cleared from local storage; the stored transcript remains and will return on reload.',
    };
  }
  return {
    persisted: false,
    notice: 'The chat history clear was not confirmed; the stored transcript may still return on reload.',
  };
}

/**
 * Surface the verdict of a chat-history write that was captured inside a React
 * state updater. The updater may be deferred, so the captured value cannot be
 * read synchronously; it is flushed on the next tick, exactly as the App's
 * existing memory-merge path does.
 */
export function flushChatHistoryNotice(
  capture: () => boolean | null | undefined,
  surface: (notice: string) => void,
  what?: string,
): void {
  setTimeout(() => {
    const { notice } = classifyChatHistoryWrite(capture(), what);
    if (notice) surface(notice);
  }, 0);
}
