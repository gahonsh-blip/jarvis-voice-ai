import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  hasRealYouTubeSummary,
  youtubeSummaryCopyText,
  youtubeTakeawaysEmptyLabel,
} from '../utils/hardening/youtubePanelSummaryTruth';

// Regression guard for backlog item 13. The in-app YouTube panel
// (AutonomousToolsModal.tsx) rendered an empty summariser result — `source:
// 'none'` with no transcript and no description — as a produced summary:
//   • "Copy Summary" copied `ytResult.summary || ''` (an empty clipboard) and
//     still toasted "Summary copied to clipboard!"
//   • the Key Takeaways tab read "Key takeaways are formatted inside the
//     Executive Summary view above." — claiming takeaways existed somewhere
//
// The decision logic is exercised directly; the wiring is asserted against the
// component source text, matching youtubeSummaryNoticeTruth.test.ts.
const modalSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/AutonomousToolsModal.tsx'),
  'utf8',
);

const EMPTY_RESULT = {
  summary: '',
  source: 'none',
  notice: 'AI synthesis is not configured and this video exposes no transcript or description, so no summary can be produced.',
};

const REAL_RESULT = {
  summary: 'A real synthesised summary.',
  source: 'gemini',
  notice: undefined,
};

describe('hasRealYouTubeSummary', () => {
  it('is false for an empty summary from the none source', () => {
    expect(hasRealYouTubeSummary(EMPTY_RESULT)).toBe(false);
  });

  it('is false for source none even when stray text is present', () => {
    expect(hasRealYouTubeSummary({ summary: 'placeholder', source: 'none' })).toBe(false);
  });

  it('is false when the summary is only whitespace', () => {
    expect(hasRealYouTubeSummary({ summary: '   \n ', source: 'gemini' })).toBe(false);
  });

  it('is true for a real gemini summary', () => {
    expect(hasRealYouTubeSummary(REAL_RESULT)).toBe(true);
  });

  it('is true for a real extractive summary', () => {
    expect(hasRealYouTubeSummary({ summary: 'Quoted transcript line.', source: 'extractive' })).toBe(true);
  });
});

describe('youtubeSummaryCopyText never yields an empty clipboard for an empty result', () => {
  it('copies the real summary verbatim', () => {
    expect(youtubeSummaryCopyText(REAL_RESULT)).toBe('A real synthesised summary.');
  });

  it('copies the explanatory notice when no summary was produced', () => {
    const text = youtubeSummaryCopyText(EMPTY_RESULT);
    expect(text.trim().length).toBeGreaterThan(0);
    expect(text).toContain('No summary was produced');
    expect(text).toContain(EMPTY_RESULT.notice);
  });

  it('falls back to a default reason when the result carries no notice', () => {
    const text = youtubeSummaryCopyText({ summary: '', source: 'none' });
    expect(text).toContain('no transcript or description');
  });
});

describe('youtubeTakeawaysEmptyLabel does not claim takeaways exist without a summary', () => {
  it('does not claim takeaways live in the summary view when nothing was produced', () => {
    const label = youtubeTakeawaysEmptyLabel(EMPTY_RESULT);
    expect(label).not.toContain('formatted inside the Executive Summary');
    expect(label.toLowerCase()).toContain('no summary was produced');
  });

  it('keeps the pointer for a real summary that simply has no separate bullets', () => {
    expect(youtubeTakeawaysEmptyLabel(REAL_RESULT)).toContain('formatted inside the Executive Summary');
  });
});

describe('the YouTube panel is wired to the truth helpers', () => {
  it('passes the whole result to handleCopySummary, not a bare summary string', () => {
    expect(modalSource).toContain('handleCopySummary(ytResult)');
    expect(modalSource).not.toContain("handleCopySummary(ytResult.summary || '')");
  });

  it('routes Copy Summary through youtubeSummaryCopyText', () => {
    expect(modalSource).toContain('youtubeSummaryCopyText(');
  });

  it('uses the takeaways empty label helper instead of the blanket claim', () => {
    expect(modalSource).toContain('youtubeTakeawaysEmptyLabel(ytResult)');
    expect(modalSource).not.toContain(
      'Key takeaways are formatted inside the Executive Summary view above.',
    );
  });
});
