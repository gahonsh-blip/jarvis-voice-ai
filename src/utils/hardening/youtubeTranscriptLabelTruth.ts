// =============================================================================
// HERMES JARVIS — YouTube transcript label truth (backlog item 13)
//
// `fetchYouTubeTranscriptData` (server_tools.ts) falls back to the video's
// description and chapter metadata when a video exposes no caption track, and
// builds a `[Video Metadata & Outline]` block that it returns in the same
// `transcript` field used for a real caption transcript. Two consumers then
// presented that outline as a transcript:
//
//   * `videoInfo.transcriptLength` was set to `description.length`, a count of
//     description characters, while the field name asserts a transcript length.
//   * the Autonomous Tools modal badged the video `🟢 Transcript Loaded`
//     whenever `hasTranscript` was true and rendered the outline under the
//     "Timestamped Transcript" tab, so an outline read as a loaded transcript.
//
// This module is the single source of truth for those two labels. It never
// invents a length or a transcript: an absent or non-finite count is `null`
// (rendered `UNKNOWN`), never a coerced `0`.
// =============================================================================

/**
 * How many transcript segments were actually observed. Returns `null` — never a
 * coerced `0` — when the count was not measured, so a caller renders `UNKNOWN`
 * instead of a measured-looking zero.
 */
export function transcriptSegmentCount(
  segments: { length: number } | null | undefined,
): number | null {
  const count = segments?.length;
  return typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : null;
}

/** `Transcribed (N segments)` for a real transcript, `UNKNOWN` otherwise. */
export function transcriptSegmentCountLabel(segments: { length: number } | null | undefined): string {
  const count = transcriptSegmentCount(segments);
  return count === null ? 'UNKNOWN' : `Transcribed (${count} segment${count === 1 ? '' : 's'})`;
}

/**
 * The badge for the video header. `Transcript Loaded` only when a caption track
 * was actually read (`hasTranscript` AND at least one segment observed);
 * `Metadata Outline` when the content is only the description/chapters.
 */
export function transcriptBadgeLabel(
  hasTranscript: boolean,
  segments: { length: number } | null | undefined,
): string {
  const count = transcriptSegmentCount(segments);
  return hasTranscript && count !== null && count > 0
    ? '🟢 Transcript Loaded'
    : '🟡 Metadata Outline';
}

/**
 * The label for the transcript tab. A real caption track shows the segment
 * count; an outline is named as an outline and never given a count.
 */
export function transcriptTabLabel(segments: { length: number } | null | undefined): string {
  const count = transcriptSegmentCount(segments);
  return count !== null && count > 0
    ? `Timestamped Transcript (${count})`
    : 'Metadata Outline';
}
