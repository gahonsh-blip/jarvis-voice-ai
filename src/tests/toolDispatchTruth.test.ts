import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  toolActionExecuted,
  toolActionResultReply,
  countedItems,
} from '../utils/toolDispatchTruth';

// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in launchDispatchTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

/** The case body, bounded at the next `case '...': {` so it cannot leak into a neighbour. */
function caseBody(intent: string, max = 1400): string {
  const label = serverFlat.indexOf(`case '${intent}':`);
  expect(label, `${intent} case missing`).toBeGreaterThan(-1);
  const rest = serverFlat.slice(label);
  const nextMatch = /case '[a-z_]+': \{/.exec(rest.slice(rest.indexOf('{') + 1));
  const end = nextMatch ? label + rest.indexOf('{') + 1 + nextMatch.index : label + max;
  return serverFlat.slice(label, Math.min(end, label + max));
}

describe('toolActionExecuted only credits a tool that reported success', () => {
  it('is true only for a successful tool run', () => {
    expect(toolActionExecuted({ success: true })).toBe(true);
  });

  it('is false for a failed tool run', () => {
    expect(toolActionExecuted({ success: false, error: 'HTTP 500' })).toBe(false);
  });
});

describe('toolActionResultReply surfaces the failure instead of a success', () => {
  it('speaks the confirmation line only on success', () => {
    expect(toolActionResultReply({ success: true }, 'Web analysis complete.', 'Web fetch', 'en-US')).toBe(
      'Web analysis complete.'
    );
  });

  it('names the failure and states nothing was executed, in English', () => {
    const reply = toolActionResultReply({ success: false, error: 'HTTP 500' }, '', 'Web fetch', 'en-US');
    expect(reply).toContain('Web fetch failed');
    expect(reply).toContain('HTTP 500');
    expect(reply).toContain('No action was executed');
    expect(reply).not.toContain('complete');
  });

  it('states nothing was executed in Hindi too', () => {
    const reply = toolActionResultReply({ success: false, error: 'timeout' }, '', 'Web fetch', 'hi-IN');
    expect(reply).toContain('विफल रहा');
    expect(reply).toContain('कोई कार्य निष्पादित नहीं हुआ');
  });

  it('falls back to an honest phrase when the tool gave no error', () => {
    expect(toolActionResultReply({ success: false }, '', 'Workspace file listing', 'en-US')).toContain(
      'no result was returned'
    );
  });
});

describe('countedItems never inflates a count', () => {
  it('counts a real array', () => {
    expect(countedItems({ items: [1, 2, 3] })).toBe(3);
  });

  it('counts zero for a missing or null list', () => {
    expect(countedItems({ items: null })).toBe(0);
    expect(countedItems({})).toBe(0);
    expect(countedItems({ items: undefined })).toBe(0);
  });
});

describe('the /api/chat tool intents credit work only when the tool succeeded', () => {
  it('list_files_tool derives actionExecuted from the real directory listing', () => {
    const body = caseBody('list_files_tool');
    expect(body).toContain('realFsList(');
    expect(body).toContain('toolActionExecuted(fsResult)');
    expect(body).not.toContain('actionExecuted = true;');
  });

  it('web_research_tool derives actionExecuted from the real fetch result', () => {
    const body = caseBody('web_research_tool');
    expect(body).toContain('realWebFetch(');
    expect(body).toContain('toolActionExecuted(webRes)');
    expect(body).not.toContain('actionExecuted = true;');
  });

  it('github_repos_tool does not claim a clean run when the listing fails or token is absent', () => {
    const body = caseBody('github_repos_tool');
    expect(body).toContain('toolActionExecuted(repos)');
    expect(body).not.toContain('actionExecuted = true;');
  });

  it('a failed YouTube extraction is not a successful summarization', () => {
    // The case body grew past the default 1200-char view when the summary-less
    // branch was added; 2000 covers the whole case so the failure path is seen.
    const body = caseBody('summarize_youtube_video', 2000);
    expect(body).toContain('actionExecuted = false');
    expect(body).toContain('actionExecuted = hasSummary;');
  });

  it('an invalid YouTube token makes the status inquiry a non-action', () => {
    const body = caseBody('youtube_status_inquiry');
    expect(body).toContain('toolActionExecuted({ success: ytTokenCheck.valid })');
  });

  it('an unperformed Level-4 YouTube upload is not counted as executed', () => {
    const body = caseBody('youtube_upload_request');
    expect(body).toContain('actionExecuted = false');
    expect(body).not.toContain('actionExecuted = true;');
    expect(body).not.toContain('Video is staged.');
  });

  it('a failed computation is not counted as an executed action', () => {
    const body = caseBody('math_computation');
    expect(body).toContain('actionExecuted = false');
    // The successful branch still records the computed value.
    expect(body).toContain('actionExecuted = true;');
  });
});
