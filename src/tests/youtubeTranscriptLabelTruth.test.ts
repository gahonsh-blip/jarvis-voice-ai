import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  transcriptSegmentCount,
  transcriptSegmentCountLabel,
  transcriptBadgeLabel,
  transcriptTabLabel,
} from '../utils/hardening/youtubeTranscriptLabelTruth';

const toolsFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server_tools.ts'), 'utf8')
  .replace(/\s+/g, ' ');
const modalFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/components/AutonomousToolsModal.tsx'), 'utf8')
  .replace(/\s+/g, ' ');

describe('YouTube transcript label truth (item 13)', () => {
  describe('transcriptSegmentCount', () => {
    it('counts real observed segments', () => {
      expect(transcriptSegmentCount([1, 2, 3])).toBe(3);
      expect(transcriptSegmentCount([])).toBe(0);
    });

    it('returns null — never a coerced 0 — when nothing was measured', () => {
      // Negative-validation anchor: the modal used `segments?.length || 0`, so an
      // absent result rendered a measured-looking zero.
      expect(transcriptSegmentCount(null)).toBeNull();
      expect(transcriptSegmentCount(undefined)).toBeNull();
      expect(transcriptSegmentCount({ length: NaN })).toBeNull();
      expect(transcriptSegmentCount({ length: Infinity })).toBeNull();
      expect(transcriptSegmentCount({ length: -1 })).toBeNull();
    });
  });

  describe('transcriptSegmentCountLabel', () => {
    it('names a real segment count', () => {
      expect(transcriptSegmentCountLabel([1, 2])).toBe('Transcribed (2 segments)');
      expect(transcriptSegmentCountLabel([1])).toBe('Transcribed (1 segment)');
    });

    it('reports UNKNOWN rather than 0 when the count was not observed', () => {
      expect(transcriptSegmentCountLabel(null)).toBe('UNKNOWN');
      expect(transcriptSegmentCountLabel(undefined)).toBe('UNKNOWN');
    });
  });

  describe('transcriptBadgeLabel', () => {
    it('shows Transcript Loaded only for a real caption track with segments', () => {
      expect(transcriptBadgeLabel(true, [1, 2, 3])).toBe('🟢 Transcript Loaded');
    });

    it('shows Metadata Outline for a description-only outline', () => {
      expect(transcriptBadgeLabel(false, [])).toBe('🟡 Metadata Outline');
      // hasTranscript true with no observed segments is still an outline.
      expect(transcriptBadgeLabel(true, [])).toBe('🟡 Metadata Outline');
      expect(transcriptBadgeLabel(true, null)).toBe('🟡 Metadata Outline');
    });
  });

  describe('transcriptTabLabel', () => {
    it('counts a real transcript', () => {
      expect(transcriptTabLabel([1, 2, 3])).toBe('Timestamped Transcript (3)');
    });

    it('names an outline as an outline instead of "Timestamped Transcript (0)"', () => {
      // Negative-validation anchor: the tab rendered `Timestamped Transcript (0)`
      // for a description-only video.
      expect(transcriptTabLabel([])).toBe('Metadata Outline');
      expect(transcriptTabLabel(null)).toBe('Metadata Outline');
      expect(transcriptTabLabel(undefined)).toBe('Metadata Outline');
    });
  });

  describe('source guards', () => {
    it('server_tools.ts no longer reports a description length as a transcript length', () => {
      expect(toolsFlat).not.toContain('transcriptLength = videoInfo.description.length');
      expect(toolsFlat).toContain('transcriptLength = 0;');
    });

    it('the modal derives its transcript labels from the truth helper', () => {
      expect(modalFlat).toContain('transcriptBadgeLabel(ytResult.videoInfo.hasTranscript, ytResult.segments)');
      expect(modalFlat).toContain('transcriptTabLabel(ytResult.segments)');
      // The old literals must not survive.
      expect(modalFlat).not.toContain("? '🟢 Transcript Loaded' : '🟡 Metadata Outline'");
      expect(modalFlat).not.toContain('Timestamped Transcript ({ytResult.segments?.length || 0})');
    });
  });
});
