import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyWebFetchContent, MIN_READABLE_CHARS } from '../utils/hardening/webFetchTruth';

const toolsSource = fs
  .readFileSync(path.resolve(process.cwd(), 'server_tools.ts'), 'utf8')
  .replace(/\s+/g, ' ');

describe('web fetch truthfulness (item 13)', () => {
  it('uses the document title and the real body text of a normal page', () => {
    const html =
      '<html><head><title>Real Article</title></head>' +
      '<body><h1>Headline</h1><p>This is the readable body of a real article.</p></body></html>';
    const verdict = classifyWebFetchContent(html);

    expect(verdict.usable).toBe(true);
    expect(verdict.title).toBe('Real Article');
    expect(verdict.titleObserved).toBe(true);
    expect(verdict.textContent).toContain('readable body');
    expect(verdict.textContent).not.toContain('Real Article');
  });

  it('prefers og:title over the document title', () => {
    const html =
      '<html><head><meta property="og:title" content="OG Title">' +
      '<title>Doc Title</title></head><body><p>Enough readable body text here.</p></body></html>';
    const verdict = classifyWebFetchContent(html);
    expect(verdict.title).toBe('OG Title');
  });

  it('refuses a consent / bot-check interstitial with no body text', () => {
    const html =
      '<html><head><title>Before you continue to YouTube</title></head>' +
      '<body></body></html>';
    const verdict = classifyWebFetchContent(html);

    expect(verdict.usable).toBe(false);
    expect(verdict.chars).toBeLessThan(MIN_READABLE_CHARS);
    expect(verdict.reason).toBeTruthy();
  });

  it('refuses a page whose only text is scripts', () => {
    const html =
      '<html><head><title>App</title></head><body>' +
      '<script>window.__DATA__ = {"a":1};</script></body></html>';
    const verdict = classifyWebFetchContent(html);
    expect(verdict.usable).toBe(false);
  });

  it('refuses an empty body', () => {
    expect(classifyWebFetchContent('').usable).toBe(false);
    expect(classifyWebFetchContent(undefined).usable).toBe(false);
    expect(classifyWebFetchContent(null).usable).toBe(false);
  });

  it('reports an unobserved title as null, never the hostname', () => {
    const html = '<html><body><p>Body text without any title element.</p></body></html>';
    const verdict = classifyWebFetchContent(html);
    expect(verdict.usable).toBe(true);
    expect(verdict.title).toBeNull();
    expect(verdict.titleObserved).toBe(false);
  });

  it('routes the fetch through the truth classifier and refuses empty pages', () => {
    expect(toolsSource).toContain('classifyWebFetchContent(rawHtml)');
    expect(toolsSource).toContain('if (!content.usable)');
    // The old hostname-as-title fallback is gone: title comes from `content.title`.
    expect(toolsSource).not.toContain('titleMatch[1].trim() : parsedUrl.hostname');
  });
});
