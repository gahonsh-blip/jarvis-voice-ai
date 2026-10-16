// ==============================================================================
// HERMES JARVIS — REAL HOST SCREEN OPERATOR ADAPTER
//
// Implements the pure engine's `ScreenOperatorAdapter` seam against the real
// host. It is the honest counterpart to `SimulatedScreenAdapter`: anything the
// host cannot actually do is refused with a reason instead of returning ok:true.
//
// Wire it in with `executeOperatorTask(createHostScreenOperator(), ...)`.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type {
  ActionResult,
  OperatorAction,
  ScreenOperatorAdapter,
  ScreenState,
  VerificationResult,
} from '../computerOperatorEngine';
import { captureScreenshot, getCaptureAvailability } from './screenshotStore';
import { probeHostState } from './hostProbe';

export interface HostScreenOperatorOptions {
  workspaceRoot: string;
  /** Paths that `read` and `screenshot` actions may touch. */
  allowedReadRoots?: string[];
}

/** Actions the host adapter can genuinely carry out. */
const SUPPORTED_ACTIONS = new Set(['screenshot', 'read', 'open', 'wait']);

export class HostScreenOperator implements ScreenOperatorAdapter {
  /** Nothing here is simulated: outcomes come from real OS interaction. */
  readonly simulationOnly = false;

  private readonly workspaceRoot: string;
  private lastScreenshotPath: string | null = null;
  private readonly allowedReadRoots: string[];

  constructor(options: HostScreenOperatorOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.allowedReadRoots = (options.allowedReadRoots || [this.workspaceRoot]).map((p) => path.resolve(p));
  }

  /** Real observation of the host desktop. */
  async observe(): Promise<ScreenState> {
    const probe = await probeHostState();
    const elements = probe.windowList.map((w, i) => {
      const [app, ...rest] = w.split(' — ');
      return {
        id: `host_win_${i}`,
        type: 'dialog' as const,
        x: 0,
        y: 0,
        text: rest.join(' — ') || app,
      };
    });

    const visibleErrors: string[] = [];
    if (!probe.observed) {
      // Surfacing this as an error makes the planner stop instead of guessing.
      visibleErrors.push('DESKTOP_STATE_UNOBSERVABLE');
    }

    return {
      id: `host-screen-${Date.now()}`,
      windowTitle: probe.windowTitle || undefined,
      elements,
      visibleErrors,
      dialogs: [],
      ambiguous: !probe.observed,
    };
  }

  /** Performs one action for real, or refuses it with a reason. */
  async act(action: OperatorAction): Promise<ActionResult> {
    if (!SUPPORTED_ACTIONS.has(action.type)) {
      // The previous implementation reported success for synthetic input it
      // never delivered. Refusing is the honest behaviour.
      return {
        ok: false,
        message: `NOT_AVAILABLE: "${action.type}" cannot be performed on this host — no OS input-automation backend is wired up.`,
      };
    }

    switch (action.type) {
      case 'screenshot':
        return this.takeScreenshot();
      case 'read':
        return this.readScreen();
      case 'open':
        return this.openTarget(action);
      case 'wait':
        await new Promise((r) => setTimeout(r, 500));
        return { ok: true, message: 'Waited 500ms for the UI to settle.' };
      default:
        return { ok: false, message: `NOT_AVAILABLE: unhandled action "${action.type}".` };
    }
  }

  /** Verifies the post-action state against the real host. */
  async verify(after: ScreenState): Promise<VerificationResult> {
    if (after.ambiguous) {
      return {
        ok: false,
        detail: 'VERIFICATION_FAILED: the host desktop state could not be observed after the action.',
      };
    }
    return {
      ok: true,
      detail: `Verified against the live host: ${after.elements.length} window(s) observed.`,
    };
  }

  // ---- individual actions ---------------------------------------------------

  private async takeScreenshot(): Promise<ActionResult> {
    const result = await captureScreenshot({ label: 'operator' });
    if (result.receipt.outcome !== 'VERIFIED' || !result.file) {
      return {
        ok: false,
        message: `${result.receipt.outcome}: ${result.receipt.detailEn}`,
      };
    }
    this.lastScreenshotPath = result.file.absolutePath;
    return {
      ok: true,
      message: `Screenshot verified at ${result.file.absolutePath} (${result.file.sizeBytes} bytes, ${result.file.width}x${result.file.height}).`,
      screenshot: result.file.absolutePath,
    };
  }

  private async readScreen(): Promise<ActionResult> {
    const probe = await probeHostState();
    if (!probe.observed) {
      return {
        ok: false,
        message: `NOT_AVAILABLE: ${probe.reason || 'the host desktop cannot be inspected.'}`,
      };
    }
    const summary = probe.windowList.length
      ? `Foreground: ${probe.activeApplication || 'unknown'} — "${probe.windowTitle || ''}". ${probe.windowList.length} window(s) visible.`
      : 'No titled windows are currently open.';
    return { ok: true, message: summary };
  }

  private async openTarget(action: OperatorAction): Promise<ActionResult> {
    const target = (action.targetText || action.value || '').trim();
    if (!target) {
      return { ok: false, message: 'FAILED: no target was supplied to open.' };
    }

    // A path inside the workspace is opened with the OS default handler.
    const resolved = path.resolve(this.workspaceRoot, target);
    const withinWorkspace = !path.relative(this.workspaceRoot, resolved).startsWith('..');
    if (!withinWorkspace && !/^https?:\/\//i.test(target)) {
      return {
        ok: false,
        message: `BLOCKED: "${target}" is outside the workspace and is not a URL.`,
      };
    }

    if (!/^https?:\/\//i.test(target) && !fs.existsSync(resolved)) {
      return { ok: false, message: `FAILED: no file or folder exists at ${resolved}.` };
    }

    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    if (!isWindows && !isMac && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      return {
        ok: false,
        message: 'NOT_AVAILABLE: no desktop session is available to open a window.',
      };
    }

    const [command, args] = isWindows
      ? (['powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${target.replace(/'/g, "''")}'`]] as const)
      : isMac
      ? (['open', [target]] as const)
      : (['xdg-open', [target]] as const);

    const code = await new Promise<number | null>((resolve) => {
      const child = spawn(command, args, { windowsHide: true });
      child.on('error', () => resolve(null));
      child.on('close', (c) => resolve(c));
    });

    if (code !== 0) {
      // The launch is handed to the OS, which does not report focus back. Saying
      // "opened" would be a guess, so this is reported as unconfirmed.
      return {
        ok: code === 0,
        message:
          code === 0
            ? `DISPATCHED: launch of "${target}" was handed to the OS; the window is not yet confirmed.`
            : `FAILED: launch of "${target}" exited with code ${code}.`,
      };
    }

    return {
      ok: true,
      message: `DISPATCHED: launch of "${target}" was handed to the OS; the window is not yet confirmed.`,
    };
  }
}

/** Convenience factory used by the server. */
export function createHostScreenOperator(workspaceRoot: string): HostScreenOperator {
  return new HostScreenOperator({ workspaceRoot });
}

/** Reports which operator actions this host can genuinely perform. */
export function describeHostOperatorCapabilities(): {
  screenshot: { available: boolean; reason?: string };
  read: { available: boolean };
  open: { available: boolean };
  syntheticInput: { available: false; reason: string };
} {
  const capture = getCaptureAvailability();
  return {
    screenshot: capture.available ? { available: true } : { available: false, reason: (capture as any).reason },
    read: { available: true },
    open: { available: true },
    syntheticInput: {
      available: false,
      reason: 'No OS input-automation backend is wired up; clicks and keystrokes cannot be delivered or verified.',
    },
  };
}