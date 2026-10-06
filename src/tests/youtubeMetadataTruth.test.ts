import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveYouTubePageMetadata } from '../../server_tools';

const toolsFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server_tools.ts'), 'utf8')
  .replace(/\s+/g, ' ');

function realWatchPage(overrides: {
  title?: string;
  author?: string;
  lengthSeconds?: string;
  shortDescription?: string;
} = {}): { html: string; playerResponse: any } {
  const {
    title = 'Real Video Title',
    author = 'Real Channel',
    lengthSeconds = '360',
    shortDescription = 'A real description.',
  } = overrides;
  const playerResponse = {
    videoDetails: { title, author, lengthSeconds, shortDescription },
    captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
  };
  const html =
    `<html><head><meta property="og:title" content="${title}">` +
    `<title>${title} - YouTube</title></head><body></body></html>`;
  return { html, playerResponse };
}

describe('YouTube metadata truthfulness (item 13)', () => {
  it('reads the real title, channel and duration from a parsed player response', () => {
    const { html, playerResponse } = realWatchPage();
    const metadata = resolveYouTubePageMetadata(html, playerResponse);

    expect(metadata.hasPlayerResponse).toBe(true);
    expect(metadata.title).toBe('Real Video Title');
    expect(metadata.channel).toBe('Real Channel');
    expect(metadata.durationSeconds).toBe(360);
    expect(metadata.description).toBe('A real description.');
    // The pre-fix placeholder values must never appear on a real resolution.
    expect(metadata.title).not.toBe('YouTube Video');
    expect(metadata.channel).not.toBe('YouTube Creator');
  });

  it('reports every field null for a consent/bot-check page — never the old placeholders', () => {
    // HTTP 200 interstitial: a generic Chrome <title>, no ytInitialPlayerResponse,
    // no og:title. The pre-fix code returned title "YouTube Video", channel
    // "YouTube Creator", duration 0 and success: true.
    const html =
      '<html><head><title>Before you continue to YouTube</title></head>' +
      '<body><form action="/consent"></form></body></html>';
    const metadata = resolveYouTubePageMetadata(html, null);

    expect(metadata.hasPlayerResponse).toBe(false);
    expect(metadata.hadOpenGraphTitle).toBe(false);
    expect(metadata.title).toBeNull();
    expect(metadata.channel).toBeNull();
    expect(metadata.durationSeconds).toBeNull();
  });

  it('does not read the generic <title> as the video title when no player response parsed', () => {
    const html = '<html><head><title>Some page - YouTube</title></head></html>';
    const metadata = resolveYouTubePageMetadata(html, null);

    expect(metadata.title).toBeNull();
  });

  it('takes only the title (not channel or duration) from an unparsed page that exposes og:title', () => {
    const html =
      '<html><head><meta property="og:title" content="Genuine Title">' +
      '<meta name="description" content="Genuine description.">' +
      '<title>Genuine Title - YouTube</title></head></html>';
    const metadata = resolveYouTubePageMetadata(html, null);

    expect(metadata.hadOpenGraphTitle).toBe(true);
    expect(metadata.title).toBe('Genuine Title');
    expect(metadata.channel).toBeNull();
    expect(metadata.durationSeconds).toBeNull();
    expect(metadata.description).toBe('Genuine description.');
  });

  it('treats a non-finite lengthSeconds as unobserved rather than 0', () => {
    const { html } = realWatchPage();
    const metadata = resolveYouTubePageMetadata(html, {
      videoDetails: { title: 'T', author: 'A', lengthSeconds: 'not-a-number', shortDescription: '' },
    });

    expect(metadata.durationSeconds).toBeNull();
    expect(metadata.title).toBe('T');
  });
});

describe('YouTube fetch route source guards (item 13)', () => {
  it('no longer hardcodes a placeholder title or channel', () => {
    expect(toolsFlat).not.toContain("'YouTube Video'");
    expect(toolsFlat).not.toContain("'YouTube Creator'");
  });

  it('resolves metadata through the shared helper and refuses a page with no observed video', () => {
    expect(toolsFlat).toContain('resolveYouTubePageMetadata(html, playerResponse)');
    expect(toolsFlat).toContain('!metadata.hasPlayerResponse && !metadata.hadOpenGraphTitle');
    // The interstitial branch must answer success: false.
    const refuseIdx = toolsFlat.indexOf('!metadata.hasPlayerResponse && !metadata.hadOpenGraphTitle');
    const refuseWindow = toolsFlat.slice(refuseIdx, refuseIdx + 400);
    expect(refuseWindow).toContain('success: false');
  });
});
