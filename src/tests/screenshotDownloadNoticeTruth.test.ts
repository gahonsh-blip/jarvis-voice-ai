import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildDownloadNotice } from '../utils/computerOperator/screenshotDispatchTruth';

// Zero-fake-success guard for the screenshot "Download PNG" action.
//
// `handleDownload` in `src/components/ScreenshotModal.tsx` set `savedMessage`
// the instant it clicked the download anchor, and the notice always read
// "Saved to device storage & logged to screenshot gallery." Two claims were
// false. The anchor click only hands the PNG to the browser — the page cannot
// confirm the write landed — and no screenshot gallery exists anywhere in this
// app (`grep` for "gallery" matched only that string). The notice now states
// only the provable hand-off, and reports a no-op when no image is in hand.

describe('the screenshot download notice claims only what is provable', () => {
  it('reports a successful hand-off without claiming a gallery or a landed file', () => {
    const notice = buildDownloadNotice('data:image/png;base64,AAAA');
    expect(notice.delivered).toBe(true);
    expect(notice.tone).toBe('success');
    expect(notice.text).toContain('Downloads');
    // It must not assert a gallery write; the only mention of a gallery is the
    // explicit denial that anything was logged.
    expect(notice.text).not.toContain('logged to screenshot gallery');
    expect(notice.text).toContain('nothing is logged to a gallery');
    expect(notice.text).not.toContain('Saved to device storage');
  });

  it('reports a no-op when no captured image is in hand', () => {
    const notice = buildDownloadNotice(null);
    expect(notice.delivered).toBe(false);
    expect(notice.tone).toBe('warn');
    expect(notice.text).toMatch(/nothing was downloaded/i);
  });
});

describe('ScreenshotModal never shows a false "saved to gallery" confirmation', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'src/components/ScreenshotModal.tsx'), 'utf8');

  it('routes the download through the truth-reporting notice builder', () => {
    expect(src).toContain('buildDownloadNotice(');
  });

  it('no longer renders the retired gallery/saved claim', () => {
    expect(src).not.toContain('Saved to device storage & logged to screenshot gallery.');
    expect(src).not.toContain('setSavedMessage');
  });

  it('renders the notice from the builder result, not a bare boolean', () => {
    expect(src).toContain('setDownloadNotice(');
    expect(src).toMatch(/downloadNotice\s*&&/);
  });
});
