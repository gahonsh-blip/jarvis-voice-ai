// ==============================================================================
// HERMES JARVIS — SCREENSHOT STORE (REAL CAPTURE + FILE VERIFICATION)
//
// Captures the screen through the host operating system and then *checks the
// file it just wrote* before claiming anything. The previous implementation drew
// a placeholder image on an HTML canvas and printed a hardcoded
// "C:\Jarvis\Screenshots\" path that never existed.
//
// Every capture returns a receipt whose outcome is VERIFIED only when a real
// file was observed on disk with a non-zero size.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { buildReceipt, makeEvidence, type ExecutionReceipt } from '../executionTruth';

export interface ScreenshotCaptureRequest {
  /** Directory to write into. Defaults to the resolved screenshot root. */
  directory?: string;
  /** Optional label included in the filename for traceability. */
  label?: string;
  /** Skip real capture and only report what the host supports. */
  probeOnly?: boolean;
}

export interface ScreenshotFile {
  absolutePath: string;
  filename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  capturedAt: string;
  sha256: string;
}

export interface ScreenshotResult {
  receipt: ExecutionReceipt;
  file: ScreenshotFile | null;
  /** How the image was produced, or null when nothing was captured. */
  method: CaptureMethod | null;
}

export type CaptureMethod = 'windows_powershell' | 'linux_import' | 'linux_gnome_screenshot' | 'macos_screencapture';

export type CaptureAvailability =
  | { available: true; method: CaptureMethod; platform: NodeJS.Platform }
  | { available: false; platform: NodeJS.Platform; reason: string };

const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

/** Default root for captured images. Overridable so tests never touch real dirs. */
export function resolveScreenshotRoot(): string {
  return process.env.JARVIS_SCREENSHOT_DIR || path.join(os.homedir(), '.jarvis', 'screenshots');
}

function isServerEnvironment(): boolean {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

/**
 * Reports which capture method this host can actually use. Called before capture
 * so the caller can report NOT_AVAILABLE instead of pretending.
 */
export function getCaptureAvailability(): CaptureAvailability {
  if (!isServerEnvironment()) {
    return {
      available: false,
      platform: 'browser' as NodeJS.Platform,
      reason: 'Screen capture runs on the agent host, not in the browser.',
    };
  }
  if (IS_WINDOWS) return { available: true, method: 'windows_powershell', platform: process.platform };
  if (IS_MAC) return { available: true, method: 'macos_screencapture', platform: process.platform };
  if (IS_LINUX) {
    // Headless CI has no X display; report honestly rather than writing a blank file.
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      return {
        available: false,
        platform: process.platform,
        reason: 'No X11/Wayland display available on this Linux host (headless).',
      };
    }
    return { available: true, method: 'linux_import', platform: process.platform };
  }
  return {
    available: false,
    platform: process.platform,
    reason: `Unsupported platform for screen capture: ${process.platform}`,
  };
}

function run(command: string, args: string[], timeoutMs = 20_000): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true }, (error, _stdout, stderr) => {
      resolve({ code: error ? ((error as any).code ?? 1) : 0, stderr: String(stderr || '') });
    });
  });
}

/** Builds the per-capture command for the host platform, writing to `outPath`. */
function buildCaptureCommand(outPath: string): { command: string; args: string[]; method: CaptureMethod } | null {
  if (IS_WINDOWS) {
    // PowerShell reads the real virtual screen and writes a PNG.
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;',
      '$b = [System.Windows.Forms.SystemInformation]::VirtualScreen;',
      `$bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height;`,
      '$g = [System.Drawing.Graphics]::FromImage($bmp);',
      '$g.CopyFromScreen($b.Left, $b.Top, 0, 0, $bmp.Size);',
      `$bmp.Save('${outPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png);`,
      '$g.Dispose(); $bmp.Dispose();',
    ].join(' ');
    return {
      command: 'powershell.exe',
      args: ['-NoProfile', '-NonInteractive', '-Command', script],
      method: 'windows_powershell',
    };
  }
  if (IS_MAC) {
    return { command: 'screencapture', args: ['-x', '-t', 'png', outPath], method: 'macos_screencapture' };
  }
  if (IS_LINUX) {
    return { command: 'import', args: ['-window', 'root', outPath], method: 'linux_import' };
  }
  return null;
}

function sha256OfFile(absolutePath: string): string {
  // Lazy import keeps this module import-safe in the browser bundle.
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
}

function buildFilename(label?: string): string {
  const safeLabel = (label || 'screen').replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 40);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `jarvis-${safeLabel}-${stamp}.png`;
}

/**
 * Reads the PNG header (IHDR) directly so the reported dimensions come from the
 * bytes on disk rather than from a value we hoped for.
 */
function readPngDimensions(absolutePath: string): { width: number; height: number } | null {
  try {
    const fd = fs.openSync(absolutePath, 'r');
    const header = Buffer.alloc(24);
    fs.readSync(fd, header, 0, 24, 0);
    fs.closeSync(fd);
    const isPng =
      header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
    if (!isPng) return null;
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } catch {
    return null;
  }
}

/** Confirms a file exists, is readable, and is non-empty. */
export function verifyScreenshotFile(
  absolutePath: string
): { ok: true; file: ScreenshotFile } | { ok: false; reason: string } {
  try {
    if (!fs.existsSync(absolutePath)) {
      return { ok: false, reason: `No file exists at ${absolutePath}` };
    }
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile()) return { ok: false, reason: `${absolutePath} is not a regular file` };
    if (stat.size === 0) return { ok: false, reason: `${absolutePath} is empty (0 bytes)` };

    const dims = readPngDimensions(absolutePath);
    return {
      ok: true,
      file: {
        absolutePath: path.resolve(absolutePath),
        filename: path.basename(absolutePath),
        sizeBytes: stat.size,
        width: dims?.width ?? null,
        height: dims?.height ?? null,
        capturedAt: stat.mtime.toISOString(),
        sha256: sha256OfFile(absolutePath),
      },
    };
  } catch (err: any) {
    return { ok: false, reason: `Could not verify ${absolutePath}: ${err?.message || err}` };
  }
}

/**
 * Captures the screen and verifies the resulting file.
 *
 * Outcomes:
 *  - VERIFIED          real file on disk, non-zero, hash recorded
 *  - NOT_AVAILABLE     headless host, unsupported platform, or no capture tool
 *  - FAILED            the capture command ran but produced no usable file
 */
export async function captureScreenshot(request: ScreenshotCaptureRequest = {}): Promise<ScreenshotResult> {
  const availability = getCaptureAvailability();
  if (!availability.available) {
    return {
      method: null,
      file: null,
      receipt: buildReceipt({
        action: 'TAKE_SCREENSHOT',
        target: request.directory || 'default',
        outcome: 'NOT_AVAILABLE',
        detailEn: `Screen capture is not available on this host: ${availability.reason}`,
        detailHi: 'इस होस्ट पर स्क्रीन कैप्चर उपलब्ध नहीं है।',
        evidence: null,
      }),
    };
  }

  const directory = request.directory || resolveScreenshotRoot();
  const filename = buildFilename(request.label);
  const absolutePath = path.join(directory, filename);

  if (request.probeOnly) {
    return {
      method: availability.method,
      file: null,
      receipt: buildReceipt({
        action: 'TAKE_SCREENSHOT',
        target: directory,
        outcome: 'NOT_CONFIGURED',
        detailEn: `Capture is available via ${availability.method}; probe only, no file written.`,
        detailHi: `कैप्चर ${availability.method} से संभव है; केवल जाँच की गई।`,
        evidence: null,
      }),
    };
  }

  try {
    fs.mkdirSync(directory, { recursive: true });
  } catch (err: any) {
    return {
      method: availability.method,
      file: null,
      receipt: buildReceipt({
        action: 'TAKE_SCREENSHOT',
        target: directory,
        outcome: 'FAILED',
        detailEn: `Could not create screenshot directory ${directory}: ${err?.message || err}`,
        detailHi: 'स्क्रीनशॉट फ़ोल्डर नहीं बनाया जा सका।',
        evidence: null,
        failureReason: 'DIRECTORY_CREATE_FAILED',
      }),
    };
  }

  const built = buildCaptureCommand(absolutePath);
  if (!built) {
    return {
      method: null,
      file: null,
      receipt: buildReceipt({
        action: 'TAKE_SCREENSHOT',
        target: directory,
        outcome: 'NOT_AVAILABLE',
        detailEn: `No capture command is implemented for platform ${process.platform}`,
        detailHi: 'इस प्लेटफ़ॉर्म के लिए कैप्चर कमांड उपलब्ध नहीं है।',
        evidence: null,
      }),
    };
  }

  const { code, stderr } = await run(built.command, built.args);

  // The command's exit code is not trusted on its own — the file is the proof.
  const verified = verifyScreenshotFile(absolutePath);
  if (!verified.ok) {
    return {
      method: built.method,
      file: null,
      receipt: buildReceipt({
        action: 'TAKE_SCREENSHOT',
        target: absolutePath,
        outcome: 'FAILED',
        detailEn: `Capture via ${built.method} produced no usable file. ${verified.reason}${
          code !== 0 ? ` (exit code ${code})` : ''
        }${stderr ? ` stderr: ${stderr.slice(0, 200)}` : ''}`,
        detailHi: 'स्क्रीनशॉट नहीं बन सका।',
        evidence: null,
        failureReason: 'CAPTURE_PRODUCED_NO_FILE',
      }),
    };
  }

  return {
    method: built.method,
    file: verified.file,
    receipt: buildReceipt({
      action: 'TAKE_SCREENSHOT',
      target: verified.file.absolutePath,
      outcome: 'VERIFIED',
      detailEn: `Captured ${verified.file.filename} (${verified.file.sizeBytes} bytes) at ${verified.file.absolutePath}`,
      detailHi: `स्क्रीनशॉट सहेजा गया: ${verified.file.filename}`,
      evidence: makeEvidence(
        'local_file',
        `File verified on disk: ${verified.file.absolutePath} (${verified.file.sizeBytes} bytes, sha256 ${verified.file.sha256.slice(0, 12)}…)`,
        { ref: verified.file.absolutePath, sizeBytes: verified.file.sizeBytes }
      ),
    }),
  };
}

/**
 * Convenience wrapper matching the previous synchronous shape used by callers:
 * always returns a receipt, never throws.
 */
export async function takeVerifiedScreenshot(label?: string): Promise<ScreenshotResult> {
  try {
    return await captureScreenshot({ label });
  } catch (err: any) {
    return {
      method: null,
      file: null,
      receipt: buildReceipt({
        action: 'TAKE_SCREENSHOT',
        target: label || 'screen',
        outcome: 'FAILED',
        detailEn: `Unexpected capture error: ${err?.message || err}`,
        detailHi: 'स्क्रीनशॉट में अनपेक्षित त्रुटि।',
        evidence: null,
        failureReason: 'UNEXPECTED_ERROR',
      }),
    };
  }
}
