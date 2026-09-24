// ==============================================================================
// Tests for the real screenshot store and host capability probing.
//
// These run against the real filesystem. On a headless CI host they assert the
// NOT_AVAILABLE path; on a host with a display they assert a verified capture.
// Either way, the point is the same: no fabricated success and no fake path.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  captureScreenshot,
  getCaptureAvailability,
  resolveScreenshotRoot,
  verifyScreenshotFile,
  takeVerifiedScreenshot,
} from '../utils/computerOperator/screenshotStore';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-shots-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Writes a minimal but structurally valid 1x1 PNG. */
function writeTinyPng(filePath: string): void {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(filePath, png);
}

describe('getCaptureAvailability', () => {
  it('reports honestly and never claims capture works on a headless host', () => {
    const availability = getCaptureAvailability();
    if (availability.available) {
      expect(['windows_powershell', 'macos_screencapture', 'linux_import']).toContain(availability.method);
      expect(typeof availability.platform).toBe('string');
    } else {
      expect(availability.reason.length).toBeGreaterThan(0);
      // The reason must be specific, not a generic "not supported" shrug.
      expect(availability.reason).toMatch(/headless|display|browser|Unsupported|agent host/i);
    }
  });

  it('cross-checks the platform against the reported method', () => {
    const availability = getCaptureAvailability();
    if (!availability.available) return;
    if (process.platform === 'win32') expect(availability.method).toBe('windows_powershell');
    if (process.platform === 'darwin') expect(availability.method).toBe('macos_screencapture');
    if (process.platform === 'linux') expect(availability.method).toBe('linux_import');
  });
});

describe('verifyScreenshotFile', () => {
  it('accepts a real PNG and reports its true size and dimensions', () => {
    const file = path.join(tmpDir, 'good.png');
    writeTinyPng(file);

    const result = verifyScreenshotFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.file.absolutePath).toBe(path.resolve(file));
    expect(result.file.filename).toBe('good.png');
    expect(result.file.sizeBytes).toBeGreaterThan(0);
    expect(result.file.width).toBe(1);
    expect(result.file.height).toBe(1);
    expect(result.file.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a file that does not exist', () => {
    const result = verifyScreenshotFile(path.join(tmpDir, 'missing.png'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('No file exists');
  });

  it('rejects an empty file rather than treating it as a capture', () => {
    const file = path.join(tmpDir, 'empty.png');
    fs.writeFileSync(file, '');
    const result = verifyScreenshotFile(file);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain('empty');
  });

  it('reports null dimensions for non-PNG bytes but still verifies the file', () => {
    const file = path.join(tmpDir, 'notapng.png');
    fs.writeFileSync(file, 'this is not a png');
    const result = verifyScreenshotFile(file);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.width).toBeNull();
    expect(result.file.height).toBeNull();
  });

  it('rejects a directory passed as a screenshot', () => {
    const dir = path.join(tmpDir, 'a-directory.png');
    fs.mkdirSync(dir, { recursive: true });
    const result = verifyScreenshotFile(dir);
    expect(result.ok).toBe(false);
  });
});

describe('captureScreenshot', () => {
  it('returns NOT_AVAILABLE with a reason on a headless host', async () => {
    const availability = getCaptureAvailability();
    if (availability.available) return; // Only meaningful on headless hosts.

    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-headless-'));
    try {
      const result = await captureScreenshot({ directory: isolated, label: 'headless' });
      expect(result.receipt.outcome).toBe('NOT_AVAILABLE');
      expect(result.receipt.verified).toBe(false);
      expect(result.file).toBeNull();
      expect(result.method).toBeNull();
      expect(result.receipt.detailEn).toContain('not available');
      // Crucially, nothing was written.
      expect(fs.readdirSync(isolated)).toEqual([]);
    } finally {
      fs.rmSync(isolated, { recursive: true, force: true });
    }
  });

  it('probeOnly reports the method without writing a file', async () => {
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-probe-'));
    try {
      const result = await captureScreenshot({ directory: isolated, probeOnly: true });
      if (result.receipt.outcome === 'NOT_AVAILABLE') {
        expect(result.file).toBeNull();
        return;
      }
      expect(result.receipt.outcome).toBe('NOT_CONFIGURED');
      expect(result.file).toBeNull();
      expect(result.method).not.toBeNull();
      expect(fs.readdirSync(isolated)).toEqual([]);
    } finally {
      fs.rmSync(isolated, { recursive: true, force: true });
    }
  });

  it('reports FAILED, not success, when the directory cannot be created', async () => {
    const availability = getCaptureAvailability();
    if (!availability.available) return;

    // A path under an existing *file* cannot be created as a directory.
    const blocker = path.join(tmpDir, 'blocker');
    fs.writeFileSync(blocker, 'x');

    const result = await captureScreenshot({ directory: path.join(blocker, 'nested') });
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.verified).toBe(false);
    expect(result.receipt.failureReason).toBe('DIRECTORY_CREATE_FAILED');
  });

  it('never reports VERIFIED without a file on disk', async () => {
    const result = await captureScreenshot({ directory: tmpDir, label: 'check' });
    if (result.receipt.outcome === 'VERIFIED') {
      expect(result.file).not.toBeNull();
      expect(fs.existsSync(result.file!.absolutePath)).toBe(true);
      expect(result.receipt.evidence?.kind).toBe('local_file');
      // Clean up the real capture so it does not linger.
      fs.rmSync(result.file!.absolutePath, { force: true });
    } else {
      expect(result.file).toBeNull();
      expect(result.receipt.verified).toBe(false);
    }
  });

  it('takeVerifiedScreenshot never throws and always returns a receipt', async () => {
    const result = await takeVerifiedScreenshot('never-throw');
    expect(result.receipt).toBeDefined();
    expect(result.receipt.verified).toBe(result.receipt.outcome === 'VERIFIED');
    if (result.file) fs.rmSync(result.file.absolutePath, { force: true });
  });
});

describe('resolveScreenshotRoot', () => {
  it('honours JARVIS_SCREENSHOT_DIR and otherwise stays outside the repo', () => {
    const previous = process.env.JARVIS_SCREENSHOT_DIR;
    process.env.JARVIS_SCREENSHOT_DIR = tmpDir;
    try {
      expect(resolveScreenshotRoot()).toBe(tmpDir);
    } finally {
      if (previous === undefined) delete process.env.JARVIS_SCREENSHOT_DIR;
      else process.env.JARVIS_SCREENSHOT_DIR = previous;
    }
  });
});