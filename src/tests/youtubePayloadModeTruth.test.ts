// HERMES JARVIS — YouTube staged payload mode honesty (backlog item 13).
//
// `SocialMediaModal.tsx` painted its payload mode from React state
// `ytIsTestPayload` and sent `isTestUpload: ytIsTestPayload`. `handleVideoFileSelect`
// cleared that flag synchronously, before the `FileReader` that fills
// `ytVideoBase64` had resolved, and had no `onerror` handler; the stage handler
// sent `videoPayloadBase64: ytVideoBase64 || undefined`. The route derives the
// mode from what arrived (`isTestUpload: !videoPayloadBase64 || isTestUpload`),
// so a file whose bytes never loaded staged a SYNTHETIC payload while the screen
// read "Binary File Mode" and the staged post carried the real file's name.
//
// These guards require the panel to derive the mode from the bytes that exist
// (helper unit tests) and to stage exactly what it displays (source guards).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  resolveYouTubePayloadMode,
  youTubeStagedFileName,
  SYNTHETIC_MODE_LABEL,
  BINARY_MODE_LABEL,
  BINARY_PENDING_LABEL,
  NO_PAYLOAD_LABEL,
} from '../utils/hardening/youtubePayloadModeTruth';

const SOURCE_PATH = path.resolve(__dirname, '../components/SocialMediaModal.tsx');
const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

const stageHandlerBody = (() => {
  const marker = source.indexOf('const handleStageYouTubeVideo');
  expect(marker, 'the YouTube stage handler was not found').toBeGreaterThanOrEqual(0);
  const end = source.indexOf('\n  };', marker);
  expect(end, 'the stage handler close could not be located').toBeGreaterThan(marker);
  return source.slice(marker, end);
})();

describe('resolveYouTubePayloadMode derives the mode from the bytes that exist', () => {
  it('reports a selected, fully-read file as a ready binary payload', () => {
    const d = resolveYouTubePayloadMode({ fileSelected: true, base64Ready: true, requestedSynthetic: false });
    expect(d.mode).toBe('binary');
    expect(d.isTestUpload).toBe(false);
    expect(d.ready).toBe(true);
    expect(d.label).toBe(BINARY_MODE_LABEL);
    expect(d.syntheticActive).toBe(false);
    expect(d.notice).toBeNull();
  });

  it('never reports binary mode while the file bytes are still unread', () => {
    const d = resolveYouTubePayloadMode({ fileSelected: true, base64Ready: false, requestedSynthetic: false });
    // The server stages a synthetic payload when no base64 arrived, so the panel
    // must not claim binary mode and must not let this be staged as one.
    expect(d.mode).toBe('binary');
    expect(d.isTestUpload).toBe(false);
    expect(d.ready).toBe(false);
    expect(d.label).toBe(BINARY_PENDING_LABEL);
    expect(d.label).not.toBe(BINARY_MODE_LABEL);
    expect(d.notice).toMatch(/not been read|synthetic/i);
  });

  it('holds staging when nothing is selected and synthetic mode is off', () => {
    const d = resolveYouTubePayloadMode({ fileSelected: false, base64Ready: false, requestedSynthetic: false });
    expect(d.ready).toBe(false);
    expect(d.label).toBe(NO_PAYLOAD_LABEL);
    expect(d.syntheticActive).toBe(false);
  });

  it('treats an explicit synthetic request as ready and synthetic', () => {
    const d = resolveYouTubePayloadMode({ fileSelected: false, base64Ready: false, requestedSynthetic: true });
    expect(d.mode).toBe('synthetic');
    expect(d.isTestUpload).toBe(true);
    expect(d.ready).toBe(true);
    expect(d.label).toBe(SYNTHETIC_MODE_LABEL);
    expect(d.syntheticActive).toBe(true);
    expect(d.notice).toBeNull();
  });

  it('keeps a deliberate synthetic request synthetic even with a file selected', () => {
    const d = resolveYouTubePayloadMode({ fileSelected: true, base64Ready: true, requestedSynthetic: true });
    expect(d.mode).toBe('synthetic');
    expect(d.isTestUpload).toBe(true);
    expect(d.ready).toBe(true);
  });

  it('labels a synthetic payload with the synthetic file name, never the selected file', () => {
    const synthetic = resolveYouTubePayloadMode({ fileSelected: true, base64Ready: true, requestedSynthetic: true });
    expect(youTubeStagedFileName(synthetic, 'board_meeting_q3.mp4')).toBe('synthetic_jarvis_test.mp4');
    const binary = resolveYouTubePayloadMode({ fileSelected: true, base64Ready: true, requestedSynthetic: false });
    expect(youTubeStagedFileName(binary, 'board_meeting_q3.mp4')).toBe('board_meeting_q3.mp4');
    expect(youTubeStagedFileName(binary, '   ')).toBe('uploaded_video.mp4');
  });
});

describe('SocialMediaModal stages the payload mode it displays', () => {
  it('derives the displayed mode and the staged mode from the same decision', () => {
    expect(source).toMatch(/const ytPayloadDecision = resolveYouTubePayloadMode\(/);
    expect(stageHandlerBody).toMatch(/isTestUpload: ytPayloadDecision\.isTestUpload/);
    expect(source).toMatch(/\{ytPayloadDecision\.label\}/);
    expect(source).toMatch(/\{ytPayloadDecision\.syntheticActive \? '✓ Active Test Mode'/);
  });

  it('never stages the raw requested flag or the real file name under a synthetic payload', () => {
    expect(stageHandlerBody).not.toMatch(/isTestUpload: ytIsTestPayload/);
    expect(stageHandlerBody).not.toMatch(/videoFileName: ytVideoFile\?\.name \|\| \(ytIsTestPayload/);
    expect(stageHandlerBody).toMatch(/videoFileName: youTubeStagedFileName\(ytPayloadDecision, ytVideoFile\?\.name\)/);
  });

  it('refuses to stage when the displayed payload is not the one that would be uploaded', () => {
    expect(stageHandlerBody).toMatch(/if \(!ytPayloadDecision\.ready\) \{/);
    expect(source).toMatch(/disabled=\{ytIsStaging \|\| !ytVideoTitle\.trim\(\) \|\| !ytPayloadDecision\.ready\}/);
    expect(source).toMatch(/\{ytPayloadDecision\.notice && \(/);
  });

  it('clears the payload and warns when the file read fails or yields no bytes', () => {
    const marker = source.indexOf('const reader = new FileReader();');
    expect(marker, 'the FileReader was not found').toBeGreaterThanOrEqual(0);
    const readerBody = source.slice(marker, source.indexOf('reader.readAsDataURL(file);', marker));
    expect(readerBody).toMatch(/reader\.onerror = \(\) => \{/);
    expect(readerBody).toMatch(/if \(!base64Data\) \{/);
    // A failed read must drop the previous file's bytes, not keep them for the
    // next file's name.
    expect(readerBody).toMatch(/setYtVideoBase64\(null\)/);
  });
});
