import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  clipboardCopyOutcome,
  clipboardTextOrNotice,
  copyToClipboard,
} from '../utils/hardening/clipboardCopyTruth';

// Zero-fake-success guard for the HUD "Copy" controls.
//
// Each modal called `navigator.clipboard.writeText(...)` and immediately set a
// "Copied" flag without observing the returned promise. `writeText` rejects
// when the Clipboard API is absent, when the document is unfocused, or when
// permission is denied — the green tick appeared anyway and the operator
// pasted nothing. These tests pin the honest behaviour: "Copied" only when the
// browser confirmed the write, an explicit "nothing was copied" otherwise.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('clipboardCopyOutcome reports only the observed verdict', () => {
  it('claims success only when the browser confirmed the write', () => {
    const outcome = clipboardCopyOutcome(true, 'The note');
    expect(outcome.copied).toBe(true);
    expect(outcome.tone).toBe('success');
    expect(outcome.label).toBe('Copied');
    expect(outcome.detail).toContain('The note was copied');
  });

  it('reports a failure and states that nothing was copied', () => {
    const outcome = clipboardCopyOutcome(false, 'The coordinates', 'permission denied');
    expect(outcome.copied).toBe(false);
    expect(outcome.tone).toBe('warn');
    expect(outcome.label).toBe('Copy failed');
    expect(outcome.detail).toContain('permission denied');
    expect(outcome.detail).toContain('Nothing was copied');
  });

  it('still states nothing was copied when no reason is supplied', () => {
    const outcome = clipboardCopyOutcome(false, 'The post text');
    expect(outcome.copied).toBe(false);
    expect(outcome.detail).toContain('Nothing was copied');
  });
});

describe('clipboardTextOrNotice never puts an empty string on the clipboard', () => {
  it('passes real content through unchanged', () => {
    expect(clipboardTextOrNotice('hello')).toBe('hello');
  });

  it('replaces a blank payload with an explanatory notice', () => {
    expect(clipboardTextOrNotice('')).toContain('Nothing was available to copy');
    expect(clipboardTextOrNotice(null)).toContain('Nothing was available to copy');
    expect(clipboardTextOrNotice(undefined)).toContain('Nothing was available to copy');
  });
});

describe('copyToClipboard resolves an honest outcome and never throws', () => {
  it('reports success when writeText resolves', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const outcome = await copyToClipboard('42.3601, -71.0589', 'The coordinates');
    expect(writeText).toHaveBeenCalledWith('42.3601, -71.0589');
    expect(outcome.copied).toBe(true);
    expect(outcome.tone).toBe('success');
  });

  it('reports failure when writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Document is not focused'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const outcome = await copyToClipboard('text', 'The note');
    expect(outcome.copied).toBe(false);
    expect(outcome.tone).toBe('warn');
    expect(outcome.detail).toContain('Document is not focused');
  });

  it('reports failure when the Clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', {});
    const outcome = await copyToClipboard('text', 'The note');
    expect(outcome.copied).toBe(false);
    expect(outcome.detail).toContain('Clipboard API is unavailable');
  });

  it('does not write and reports failure for an empty payload', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const outcome = await copyToClipboard('', 'The SSH command', 'the server reported no SSH address to copy');
    expect(writeText).not.toHaveBeenCalled();
    expect(outcome.copied).toBe(false);
    expect(outcome.detail).toContain('no SSH address');
  });
});

describe('the copy surfaces route through the truth helper', () => {
  const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

  it('NotepadModal, BlueprintRoadmapModal and LocationServicesModal use copyToClipboard', () => {
    for (const file of [
      'src/components/NotepadModal.tsx',
      'src/components/BlueprintRoadmapModal.tsx',
      'src/components/LocationServicesModal.tsx',
    ]) {
      const src = read(file);
      expect(src).toContain('copyToClipboard(');
      // The old unconditional flag must be gone.
      expect(src).not.toContain('navigator.clipboard.writeText');
    }
  });

  it('OracleCloudModal, SocialMediaModal and PermissionGateway use copyToClipboard', () => {
    for (const file of [
      'src/components/OracleCloudModal.tsx',
      'src/components/SocialMediaModal.tsx',
      'src/components/PermissionGateway.tsx',
    ]) {
      const src = read(file);
      expect(src).toContain('copyToClipboard(');
      expect(src).not.toContain('navigator.clipboard.writeText');
    }
  });

  it('FreelancePipelineModal, AutonomousToolsModal and MobilePersonalStatusModal use copyToClipboard', () => {
    for (const file of [
      'src/components/FreelancePipelineModal.tsx',
      'src/components/AutonomousToolsModal.tsx',
      'src/components/MobilePersonalStatusModal.tsx',
    ]) {
      const src = read(file);
      expect(src).toContain('copyToClipboard(');
      expect(src).not.toContain('navigator.clipboard.writeText');
    }
  });
});
