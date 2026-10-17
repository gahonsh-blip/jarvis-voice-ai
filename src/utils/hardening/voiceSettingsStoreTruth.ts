// ==============================================================================
// HERMES JARVIS — VOICE-SETTINGS STORE DURABILITY TRUTH (backlog item 13)
//
// `saveLocalVoiceSettings` reports whether the write reached `localStorage`, and
// `src/utils/offlineStorage.ts` returns that verdict. The persist effect in
// `src/App.tsx` (`useEffect([voiceSettings])`) called it as a bare statement, so
// the boolean was thrown away. On a full disk, in private mode, or on a host with
// no `localStorage` the reply was never persisted while the Settings modal still
// showed the new rate / pitch / volume / language as applied, and the next reload
// silently restored the previous settings — the operator's edits looked durable
// and were not. Nothing distinguished a saved settings object from an ephemeral
// one. This is the same defect shape the chat-history and memory-store sites
// already fixed; the voice-settings write was the remaining discarded verdict on
// the offline-storage persist path.
//
// This module turns the observed verdict into a one-line notice. Only a landed
// write is silent; a refused write names what was lost and states the reload
// revert. It mirrors `chatHistoryStoreTruth.classifyChatHistoryWrite`.
// ==============================================================================

export interface VoiceSettingsWriteNotice {
  /** The boolean `saveLocalVoiceSettings` actually returned. */
  persisted: boolean;
  /** Full sentence for an inline notice; empty when the write landed. */
  notice: string;
}

/**
 * Turn the real `saveLocalVoiceSettings` verdict into a notice. `persisted` may
 * be `null`/`undefined` when the write has not been observed yet, which is
 * reported as unconfirmed rather than upgraded to a save.
 */
export function classifyVoiceSettingsWrite(
  persisted: boolean | null | undefined,
  what = 'Your voice settings',
): VoiceSettingsWriteNotice {
  const target = what.trim() || 'Your voice settings';
  if (persisted === true) return { persisted: true, notice: '' };
  if (persisted === false) {
    return {
      persisted: false,
      notice: `${target} could NOT be saved to local storage; they stay in this session only and revert on reload.`,
    };
  }
  return {
    persisted: false,
    notice: `${target} were not confirmed saved to local storage; they may not survive a reload.`,
  };
}
