// ==============================================================================
// HERMES JARVIS — HOST PROBE (REAL WINDOW / PROCESS OBSERVATION)
//
// Answers "what is actually running on this machine right now?" so verification
// compares against reality instead of a hardcoded story about VS Code.
//
// Every probe reports its own confidence. When the host cannot be inspected the
// result says so — `observed: false` — and callers must treat the state as
// UNKNOWN rather than assuming the screen looks the way the plan hoped.
// ==============================================================================

import { execFile } from 'node:child_process';
import os from 'node:os';
import { ScreenObservation, UIElement } from '../../types/computerOperator';
import { captureScreenshot } from './screenshotStore';

export interface HostProbeResult {
  /** False when this host cannot be inspected at all. */
  observed: boolean;
  reason?: string;
  platform: NodeJS.Platform;
  activeApplication: string | null;
  windowTitle: string | null;
  windowList: string[];
  processCount: number | null;
  screenResolution: { width: number; height: number } | null;
  probedAt: string;
}

function run(command: string, args: string[], timeoutMs = 10_000): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => {
      resolve(error ? '' : String(stdout || ''));
    });
  });
}

const IS_WINDOWS = process.platform === 'win32';
const IS_MAC = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

/**
 * Inspects the host desktop. Reports `observed: false` when no desktop session
 * or inspection tool is available (e.g. headless CI).
 */
export async function probeHostState(): Promise<HostProbeResult> {
  const base: HostProbeResult = {
    observed: false,
    platform: process.platform,
    activeApplication: null,
    windowTitle: null,
    windowList: [],
    processCount: null,
    screenResolution: null,
    probedAt: new Date().toISOString(),
  };

  if (IS_WINDOWS) {
    const script = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      '$b = [System.Windows.Forms.SystemInformation]::VirtualScreen;',
      'Write-Output ("RES|{0}|{1}" -f $b.Width, $b.Height);',
      '$p = Get-Process | Where-Object { $_.MainWindowTitle -ne "" };',
      '$p | ForEach-Object { Write-Output ("WIN|{0}|{1}" -f $_.ProcessName, $_.MainWindowTitle) };',
      'Write-Output ("CNT|{0}" -f ((Get-Process).Count));',
    ].join(' ');
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    if (!out.trim()) {
      return { ...base, reason: 'PowerShell probe returned no data.' };
    }

    let resolution: { width: number; height: number } | null = null;
    const windows: string[] = [];
    let firstApp: string | null = null;
    let firstTitle: string | null = null;
    let count: number | null = null;

    for (const line of out.split(/\r?\n/)) {
      if (line.startsWith('RES|')) {
        const [, w, h] = line.split('|');
        if (Number(w) > 0 && Number(h) > 0) resolution = { width: Number(w), height: Number(h) };
      } else if (line.startsWith('WIN|')) {
        const [, proc, title] = line.split('|');
        if (proc) {
          windows.push(`${proc} — ${title || '(no title)'}`);
          if (!firstApp) {
            firstApp = proc;
            firstTitle = title || null;
          }
        }
      } else if (line.startsWith('CNT|')) {
        const n = Number(line.split('|')[1]);
        if (Number.isFinite(n)) count = n;
      }
    }

    return {
      ...base,
      observed: true,
      activeApplication: firstApp,
      windowTitle: firstTitle,
      windowList: windows,
      processCount: count,
      screenResolution: resolution,
    };
  }

  if (IS_MAC) {
    const out = await run('osascript', [
      '-e',
      'tell application "System Events" to get name of first application process whose frontmost is true',
    ]);
    const app = out.trim() || null;
    return { ...base, observed: Boolean(app), reason: app ? undefined : 'No frontmost application reported.', activeApplication: app };
  }

  if (IS_LINUX) {
    if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      return { ...base, reason: 'Headless Linux host: no DISPLAY or WAYLAND_DISPLAY is set.' };
    }
    const out = await run('xdotool', ['getactivewindow', 'getwindowname']);
    const title = out.trim() || null;
    return {
      ...base,
      observed: Boolean(title),
      reason: title ? undefined : 'xdotool is unavailable or reported no active window.',
      windowTitle: title,
    };
  }

  return { ...base, reason: `Host probing is not implemented for ${process.platform}.` };
}

/**
 * Builds a ScreenObservation grounded in the real host state.
 *
 * When the host cannot be inspected, `isAmbiguous` is set so the operator engine
 * halts for human guidance rather than acting on an imagined screen.
 *
 * When `includeScreenshot` is set, a real capture is attempted and its verified
 * absolute path is attached. If capture is unavailable the observation simply
 * carries no `screenshot`, which the verifier treats as "not captured".
 */
export async function describeHostScreen(
  _workspaceRoot: string,
  options: { includeScreenshot?: boolean } = {}
): Promise<ScreenObservation> {
  const probe = await probeHostState();
  const elements: UIElement[] = probe.windowList.map((w, i) => {
    const [app, ...rest] = w.split(' — ');
    return {
      id: `host_win_${i}`,
      type: 'dialog' as const,
      label: rest.join(' — ') || app,
      coordinates: { x: 0, y: 0 },
      app,
      enabled: true,
      state: i === 0 ? 'foreground' : 'background',
    };
  });

  let screenshotPath: string | undefined;
  if (options.includeScreenshot) {
    const capture = await captureScreenshot({ label: 'observe' });
    if (capture.receipt.outcome === 'VERIFIED' && capture.file) {
      screenshotPath = capture.file.absolutePath;
    }
  }

  return {
    id: `obs-host-${Date.now()}`,
    timestamp: probe.probedAt,
    activeWindow: probe.windowTitle || (probe.observed ? 'Unknown window' : 'No desktop session'),
    activeApplication: probe.activeApplication || (probe.observed ? 'Unknown' : 'None'),
    windowTitle: probe.windowTitle || '',
    visibleElements: elements,
    detectedErrors: [],
    screenResolution: probe.screenResolution || { width: 0, height: 0 },
    screenshot: screenshotPath,
    isAmbiguous: !probe.observed,
    ambiguityReason: probe.observed
      ? undefined
      : `Host state could not be observed: ${probe.reason || 'unknown reason'}. Reporting as ambiguous rather than guessing.`,
    platform: IS_WINDOWS ? 'windows' : IS_MAC ? 'darwin' : IS_LINUX ? 'linux' : 'browser',
  };
}

/** Short host summary used in logs and health output. */
export function describeHost(): { platform: string; arch: string; release: string; desktopSession: boolean } {
  return {
    platform: process.platform,
    arch: process.arch,
    release: os.release(),
    desktopSession: IS_WINDOWS || IS_MAC || Boolean(process.env.DISPLAY) || Boolean(process.env.WAYLAND_DISPLAY),
  };
}
