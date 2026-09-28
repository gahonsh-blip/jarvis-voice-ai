import { describe, it, expect } from 'vitest';
import {
  buildYouTubeSummary,
  heuristicTranscriptSummarize,
  YouTubeVideoInfo,
} from '../../server_tools';

function makeVideoInfo(overrides: Partial<YouTubeVideoInfo> = {}): YouTubeVideoInfo {
  return {
    videoId: 'dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    title: 'Test Video',
    channel: 'Test Channel',
    durationSeconds: 120,
    durationFormatted: '2:00',
    description: '',
    thumbnailUrl: 'https://example.com/thumb.jpg',
    hasTranscript: false,
    transcriptLength: 0,
    availableLanguages: [],
    ...overrides,
  };
}

const REAL_SEGMENTS = [
  { start: 0, duration: 5, timestamp: '0:00', text: 'Welcome back to the channel everyone.' },
  { start: 5, duration: 5, timestamp: '0:05', text: 'Today we build a zero fake success policy for every tool.' },
];

describe('YouTube summarizer truthfulness (item 13)', () => {
  it('produces NO summary and PARTIAL status when there is no transcript and no description', () => {
    // Negative-validation anchor: the pre-fix heuristic returned a plausible
    // generated paragraph here, fabricated from the title alone.
    const result = buildYouTubeSummary({
      videoInfo: makeVideoInfo(),
      segments: [],
      transcript: '',
      description: '',
      geminiRawSummary: null,
      geminiFailed: true,
    });

    expect(result.source).toBe('none');
    expect(result.verificationStatus).toBe('PARTIAL');
    expect(result.summary).toBe('');
    expect(result.executiveOverview).toBe('');
    expect(result.keyTakeaways).toEqual([]);
    expect(result.actionableInsights).toEqual([]);
    expect(result.notice).toBeTruthy();
  });

  it('does not fabricate when Gemini is unavailable and only a description exists — quotes the description', () => {
    const description = 'This episode covers real evidence based engineering practices in depth.';

    const result = buildYouTubeSummary({
      videoInfo: makeVideoInfo({ description, hasTranscript: false }),
      segments: [],
      transcript: '',
      description,
      geminiRawSummary: null,
      geminiFailed: false,
    });

    expect(result.source).toBe('extractive');
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.summary).toContain(description);
    expect(result.notice).toContain('extractive');
  });

  it('quotes transcript lines verbatim in extractive mode and never invents text', () => {
    const transcript = REAL_SEGMENTS.map((s) => s.text).join(' ');

    const result = buildYouTubeSummary({
      videoInfo: makeVideoInfo({ hasTranscript: true, transcriptLength: transcript.length }),
      segments: REAL_SEGMENTS,
      transcript,
      description: '',
      geminiRawSummary: null,
      geminiFailed: false,
    });

    expect(result.source).toBe('extractive');
    expect(result.verificationStatus).toBe('VERIFIED');
    for (const segment of REAL_SEGMENTS) {
      expect(result.summary).toContain(segment.text);
    }
    // Every quoted insight must be a substring of the real source text.
    for (const insight of result.actionableInsights) {
      expect(transcript).toContain(insight);
    }
  });

  it('marks the result VERIFIED and source=gemini when AI synthesis succeeds', () => {
    const rawSummary = '### 📌 Executive Overview\nA real synthesized summary.\n\n• First takeaway';

    const result = buildYouTubeSummary({
      videoInfo: makeVideoInfo({ hasTranscript: true }),
      segments: REAL_SEGMENTS,
      transcript: REAL_SEGMENTS.map((s) => s.text).join(' '),
      description: '',
      geminiRawSummary: rawSummary,
      geminiFailed: false,
    });

    expect(result.source).toBe('gemini');
    expect(result.verificationStatus).toBe('VERIFIED');
    expect(result.summary).toBe(rawSummary);
    expect(result.keyTakeaways).toContain('• First takeaway');
  });

  it('heuristicTranscriptSummarize reports hasSourceText=false with an empty source', () => {
    const heuristic = heuristicTranscriptSummarize('Some Title', 'Some Channel', '3:00', [], '');

    expect(heuristic.hasSourceText).toBe(false);
    expect(heuristic.keyTakeaways).toEqual([]);
    expect(heuristic.actionableInsights).toEqual([]);
    // The placeholder text must not claim to describe the video's content.
    expect(heuristic.executiveSummary).toContain('No transcript or description is available');
  });
});