// ==============================================================================
// HERMES JARVIS — STAGED YOUTUBE UPLOAD TARGET CHANNEL, STATED HONESTLY
//
// The YouTube draft routes (`POST /api/social/youtube/upload-draft` and
// `POST /api/social/youtube/draft-test` in server.ts) stored a target channel of
// `memoryState.youTubeConnection?.channelTitle || 'Connected Channel'` and then
// fell back to `'YouTube Channel'` for the post's own `targetChannel`. Nothing
// in either route reads the channel — they only stage a local draft for Level-4
// authorization — so a draft that had never seen a channel displayed the invented
// names "Connected Channel" / "YouTube Channel". The Social Hub then rendered
// them (`SocialMediaModal.tsx` fell back to `'Connected YouTube Channel'` when
// the field was empty), presenting a target channel nobody observed.
//
// A staged draft may carry the channel that was actually recorded in memory, or
// it must say no channel was read. It may not invent one.
// ==============================================================================

/** Names that earlier code invented when no channel title had been recorded. */
const INVENTED_CHANNEL_NAMES = new Set([
  'YouTube Channel',
  'Connected Channel',
  'Connected YouTube Channel',
]);

/**
 * Returns the recorded channel title, or `null` when none was observed. A
 * blank string and any of the historical placeholder names count as "not
 * recorded" so a stale value or a replayed payload cannot read as a real
 * channel.
 */
export function recordedChannelTitle(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (INVENTED_CHANNEL_NAMES.has(trimmed)) return null;
  return trimmed;
}

/** Label a surface renders when no channel title was recorded. */
export const CHANNEL_NOT_RECORDED_LABEL = 'channel not recorded — no channel was read';

/** Display string for a staged draft's target channel. Never invents a name. */
export function describeStagedChannel(raw: unknown): string {
  return recordedChannelTitle(raw) ?? CHANNEL_NOT_RECORDED_LABEL;
}
