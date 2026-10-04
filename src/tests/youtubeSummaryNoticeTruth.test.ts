import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { formatYouTubeSummaryNotice } from '../utils/hardening/youtubeSummaryNoticeTruth';

// Regression guard for backlog item 13. `buildYouTubeSummary` returns
// `success: true` with an EMPTY summary (`source: 'none'`) when a video exposes
// no transcript and no description. The Telegram reply branched only on
// `success && videoInfo`, so it still rendered the "YOUTUBE VIDEO SUMMARY"
// heading with a blank body — reading as a summary that was never produced.
// server.ts binds a port on import, so the wiring is asserted against the source
// text and the decision logic is exercised directly, matching
// routineTriggerTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

describe('formatYouTubeSummaryNotice withholds the summary framing when nothing was summarised', () => {
  it('returns a leading notice for an empty summary from the none source', () => {
    const notice = formatYouTubeSummaryNotice({
      summary: '',
      source: 'none',
      notice: 'AI synthesis is not configured and this video exposes no transcript or description, so no summary can be produced.',
    });
    expect(notice).toBeTruthy();
    expect(notice).toContain('No summary was produced');
  });

  it('returns a notice even when source is none but stray text is present', () => {
    const notice = formatYouTubeSummaryNotice({ summary: 'placeholder', source: 'none' });
    expect(notice).toBeTruthy();
  });

  it('returns a notice when the summary is only whitespace', () => {
    expect(formatYouTubeSummaryNotice({ summary: '   \n ', source: 'gemini' })).toBeTruthy();
  });

  it('falls back to a default reason when the result carries no notice', () => {
    const notice = formatYouTubeSummaryNotice({ summary: '', source: 'none' });
    expect(notice).toContain('no transcript or description');
  });

  it('returns null for a real extractive summary', () => {
    expect(
      formatYouTubeSummaryNotice({ summary: 'Quoted lines from the transcript.', source: 'extractive' }),
    ).toBeNull();
  });

  it('returns null for a real gemini summary', () => {
    expect(formatYouTubeSummaryNotice({ summary: 'A synthesised summary.', source: 'gemini' })).toBeNull();
  });
});

describe('the youtube summary reply no longer renders a blank summary body', () => {
  const block = (() => {
    const start = serverSource.indexOf("intentData.intent === 'summarize_youtube_video'");
    return serverSource.slice(start, serverSource.indexOf("intentData.intent === 'check_project'", start));
  })();

  it('routes through formatYouTubeSummaryNotice before building the reply', () => {
    expect(block).toContain('formatYouTubeSummaryNotice(');
  });

  it('renders the no-summary branch before the confident summary branch', () => {
    const unavailableAt = block.indexOf("type: 'youtube_summary_unavailable'");
    const confidentAt = block.indexOf("type: 'youtube_summary',");
    expect(unavailableAt).toBeGreaterThan(-1);
    expect(confidentAt).toBeGreaterThan(-1);
    // The unavailable branch must come first so an empty summary cannot fall
    // through to the heading + blank body.
    expect(unavailableAt).toBeLessThan(confidentAt);
  });

  it('gates the confident summary reply behind the no-summary check', () => {
    // The confident reply must sit in the `else` of the `noSummaryNotice`
    // check, so an empty summary can never render the heading with a blank body.
    expect(block).toMatch(/if \(noSummaryNotice\)/);
    expect(block).toMatch(/else \{[\s\S]*YOUTUBE VIDEO SUMMARY/);
  });
});
