import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { browserOpenVerdict, browserDestinationUrl, browserOpenActionDetail, searchDispatch } from '../utils/browserDispatchTruth';

// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in launchDispatchTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const appFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8')
  .replace(/\s+/g, ' ');

describe('browser-open verdict names a site only when the view loads it', () => {
  it('points YouTube at youtube.com, not the Google home', () => {
    const verdict = browserOpenVerdict('open_youtube');
    expect(browserDestinationUrl('open_youtube')).toBe('https://www.youtube.com');
    expect(verdict.pointed).toBe(true);
    expect(verdict.url).toBe('https://www.youtube.com');
    expect(verdict.replyEn).toContain('YouTube');
    expect(verdict.replyEn).not.toContain('google.com');
  });

  it.each([
    ['open_google', 'https://www.google.com', 'Google'],
    ['open_youtube', 'https://www.youtube.com', 'YouTube'],
    ['open_gmail', 'https://mail.google.com', 'Gmail'],
    ['open_chatgpt', 'https://chatgpt.com', 'ChatGPT'],
  ])('%s resolves to %s', (intent, url, label) => {
    const verdict = browserOpenVerdict(intent);
    expect(verdict.site).toBe(label);
    expect(verdict.url).toBe(url);
    expect(verdict.pointed).toBe(true);
    expect(verdict.title).toContain(label);
  });

  it('falls back to the intent table when the caller resolved no URL', () => {
    const verdict = browserOpenVerdict('open_gmail', '');
    expect(verdict.pointed).toBe(true);
    expect(verdict.url).toBe('https://mail.google.com');
    expect(verdict.replyEn).toContain('at Gmail');
  });

  it('does not claim a named site when the target points elsewhere', () => {
    const verdict = browserOpenVerdict('open_chatgpt', 'https://www.google.com');
    expect(verdict.pointed).toBe(false);
    expect(verdict.url).toBe('https://www.google.com');
  });

  it('leaves open_chrome and google_search without a fixed destination', () => {
    expect(browserDestinationUrl('open_chrome')).toBeNull();
    expect(browserDestinationUrl('google_search')).toBeNull();
    const chrome = browserOpenVerdict('open_chrome');
    expect(chrome.site).toBeNull();
    expect(chrome.replyEn).toContain('No external browser was launched');
  });
});

describe('the action detail carries the destination where the app reads it', () => {
  it('puts the resolved URL inside payload.target, not at the top level', () => {
    const detail = browserOpenActionDetail(browserOpenVerdict('open_youtube'));
    expect(detail.type).toBe('open_youtube');
    expect(detail.payload.target).toBe('https://www.youtube.com');
    expect((detail as unknown as Record<string, unknown>).target).toBeUndefined();
  });

  it.each([
    ['open_google', 'https://www.google.com'],
    ['open_youtube', 'https://www.youtube.com'],
    ['open_gmail', 'https://mail.google.com'],
    ['open_chatgpt', 'https://chatgpt.com'],
  ])('%s carries %s in payload.target', (intent, url) => {
    const detail = browserOpenActionDetail(browserOpenVerdict(intent));
    expect(detail.payload.target).toBe(url);
  });

  it('falls back to the default home when a named site could not be pointed', () => {
    const detail = browserOpenActionDetail(browserOpenVerdict('open_chatgpt', 'https://www.google.com'));
    expect(detail.payload.target).toBe('https://www.google.com');
    expect(detail.title).toContain('not loaded');
  });
});

describe('a search request carries the URL the Browser must load', () => {
  it('derives the Google search URL from the query', () => {
    const dispatch = searchDispatch('latest TypeScript releases');
    expect(dispatch.url).toBe('https://www.google.com/search?q=latest%20TypeScript%20releases');
    expect(dispatch.query).toBe('latest TypeScript releases');
    expect(dispatch.replyEn).toContain('latest TypeScript releases');
    expect(dispatch.replyEn).toContain('No external browser was launched');
  });

  it('trims the query before deriving the URL', () => {
    expect(searchDispatch('  spaced  ').query).toBe('spaced');
    expect(searchDispatch('  spaced  ').url).toContain('spaced');
  });

  it('falls back to the default home for an empty query instead of a bare /search?q=', () => {
    const dispatch = searchDispatch('   ');
    expect(dispatch.query).toBe('');
    expect(dispatch.url).toBe('https://www.google.com');
    expect(dispatch.url).not.toContain('search?q=');
  });

  it('offers a Hindi reply that also names the query', () => {
    const dispatch = searchDispatch('रिएक्ट हुक्स');
    expect(dispatch.replyHi).toContain('रिएक्ट हुक्स');
    expect(dispatch.replyHi).toContain('इन-ऐप ब्राउज़र');
  });
});

describe('server + app wiring carry the destination through', () => {
  it('server derives the search reply and target from searchDispatch', () => {
    expect(serverFlat).toContain('import { browserOpenVerdict, browserOpenActionDetail, searchDispatch } from');
    expect(serverFlat).toContain('const dispatch = searchDispatch(query);');
    // The target rode at the top level before, where the app dispatcher never reads it.
    expect(serverFlat).toContain('payload: { query: dispatch.query, target: dispatch.url }');
    expect(serverFlat).not.toContain('target: `https://www.google.com/search?q=${encodeURIComponent(query)}`');
  });

  it('the app hands the search URL to the view from payload.target', () => {
    expect(appFlat).toContain("case 'google_search': setBrowserSearchQuery(payload?.query || ''); setBrowserInitialUrl(payload?.target || ''); setActiveApp('browser');");
    expect(appFlat).not.toContain("case 'google_search': setBrowserSearchQuery(payload?.query || ''); setBrowserInitialUrl('');");
  });

  it('server derives the browser-open reply and target from browserOpenVerdict', () => {
    expect(serverFlat).toContain('import { browserOpenVerdict, browserOpenActionDetail, searchDispatch } from');
    expect(serverFlat).toContain("case 'open_google': case 'open_youtube': case 'open_gmail': case 'open_chatgpt': {");
    expect(serverFlat).toContain('const verdict = browserOpenVerdict(intentData.intent);');
    expect(serverFlat).toContain('actionDetail = browserOpenActionDetail(verdict);');
    // A top-level `target` on the action detail never reaches the app dispatcher.
    expect(serverFlat).not.toContain('target: verdict.url,');
  });

  it('the app reads the destination from actionDetail.payload and hands it to the view', () => {
    expect(appFlat).toContain('setBrowserInitialUrl(payload?.target || \'\');');
    expect(appFlat).toContain('handleExecuteAction(data.intent, data.actionDetail?.payload);');
    expect(appFlat).toContain('initialUrl={browserInitialUrl}');
  });
});
