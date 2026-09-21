// ==============================================================================
// HERMES JARVIS — HOST ACTION EXECUTOR (REAL OS ACTIONS)
//
// Performs computer actions against the real operating system and reports only
// what it can prove. This module is Node-only; the browser bundle never imports
// it. The Computer Operator engine receives it via `setExecutor()` on the server.
//
// Design rule: if we cannot carry out an action for real, we say NOT_AVAILABLE
// and explain why. We never return success for something we did not do.
// ==============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { ComputerAction, ScreenObservation } from '../../types/computerOperator';
import { buildReceipt, makeEvidence, type ExecutionReceipt } from '../executionTruth';
import { captureScreenshot, getCaptureAvailability } from './screenshotStore';
import { probeHostState, describeHostScreen } from './hostProbe';
import { PermissionGuard } from './permissionGuard';
import { isEmergencyStopActive } from '../hardening/emergencyStop';

export interface HostActionResult {
  actionId: string;
  receipt: ExecutionReceipt;
  /** Captured command output, already redacted by the caller. */
  output?: string;
  exitCode?: number | null;
}

export interface HostExecutorOptions {
  /** Working directory for relative paths and commands. */
  workspaceRoot: string;
  /** Hard ceiling on a single command's runtime. */
  commandTimeoutMs?: number;
}

export interface HostExecuteOptions {
  /**
   * Set only by the approval path (`ComputerOperatorEngine.resumeApprovedTask`)
   * once a named human has authorized a Level-4 / approval-gated action. Every
   * other caller leaves this false, so an unapproved gated action is held.
   */
  approved?: boolean;
}

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * Actions this host can genuinely perform. Anything absent is reported as
 * NOT_AVAILABLE rather than silently "succeeding".
 */
export function hostActionCapabilities(): Record<string, { available: boolean; reason?: string }> {
  const screenshot = getCaptureAvailability();
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  return {
    TERMINAL_COMMAND: { available: true },
    READ_FILE: { available: true },
    EDIT_FILE: { available: true },
    RUN_TESTS: { available: true },
    TAKE_SCREENSHOT: screenshot.available
      ? { available: true }
      : { available: false, reason: (screenshot as any).reason },
    INSPECT_SCREEN: screenshot.available
      ? { available: true }
      : { available: false, reason: (screenshot as any).reason },
    LAUNCH_APP: {
      available: isWindows || isMac || Boolean(process.env.DISPLAY) || Boolean(process.env.WAYLAND_DISPLAY),
      reason: 'Requires a desktop session to launch applications.',
    },
    CLICK: {
      available: false,
      reason: 'No OS input-automation backend is wired up; synthetic clicks cannot be verified.',
    },
    DOUBLE_CLICK: { available: false, reason: 'No OS input-automation backend is wired up.' },
    RIGHT_CLICK: { available: false, reason: 'No OS input-automation backend is wired up.' },
    MOUSE_MOVE: { available: false, reason: 'No OS input-automation backend is wired up.' },
    SCROLL: { available: false, reason: 'No OS input-automation backend is wired up.' },
    TYPE_TEXT: { available: false, reason: 'No OS input-automation backend is wired up.' },
    KEY_COMBINATION: { available: false, reason: 'No OS input-automation backend is wired up.' },
    SWITCH_WINDOW: { available: false, reason: 'Window focus control is not implemented.' },
    CLOSE_WINDOW: { available: false, reason: 'Window control is not implemented.' },
    WAIT: { available: true },
  };
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number
): Promise<{ code: number | null; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    // Detached so the whole process group can be reaped: killing only the shell
    // leaves grandchildren alive holding the stdout pipe, so 'close' never fires.
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      detached: process.platform !== 'win32',
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // group already gone
        }
      }
      try {
        child.kill('SIGKILL');
      } catch {
        // already gone
      }
      // Do not wait on 'close': an escaped grandchild could hold the pipe open.
      finish(null);
    }, timeoutMs);

    child.stdout?.on('data', (d) => {
      stdout += String(d);
      if (stdout.length > 200_000) stdout = stdout.slice(-200_000);
    });
    child.stderr?.on('data', (d) => {
      stderr += String(d);
      if (stderr.length > 100_000) stderr = stderr.slice(-100_000);
    });

    child.on('error', (err) => {
      stderr = stderr || String(err.message);
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}

/** Resolves a requested path against the workspace, refusing escapes. */
export function resolveWorkspacePath(workspaceRoot: string, requested: string): { ok: true; absolute: string } | { ok: false; reason: string } {
  const root = path.resolve(workspaceRoot);
  const absolute = path.resolve(root, requested);
  const rel = path.relative(root, absolute);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return { ok: false, reason: `Path "${requested}" resolves outside the workspace root.` };
  }
  return { ok: true, absolute };
}

export class HostActionExecutor {
  private readonly workspaceRoot: string;
  private readonly commandTimeoutMs: number;

  constructor(options: HostExecutorOptions) {
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private unavailable(action: ComputerAction, reason: string): HostActionResult {
    return {
      actionId: action.id,
      receipt: buildReceipt({
        action: action.type,
        target: action.description,
        outcome: 'NOT_AVAILABLE',
        detailEn: `Cannot perform ${action.type}: ${reason}`,
        detailHi: `यह कार्य इस होस्ट पर संभव नहीं है: ${reason}`,
        evidence: null,
        failureReason: 'ACTION_NOT_AVAILABLE_ON_HOST',
      }),
    };
  }

  /**
   * Safety gate every dispatch must pass before the OS is touched.
   *
   * Returns the blocked/held result, or `null` when the action may run.
   */
  private safetyRefusal(action: ComputerAction, options?: HostExecuteOptions): HostActionResult | null {
    const emergencyStop = isEmergencyStopActive();

    const safety = PermissionGuard.evaluateHostSafety(action, emergencyStop);
    if (safety) {
      // A destructive command is held for a named human; anything else that
      // fires here (finance, security bypass, kill switch) is permanent.
      const held = safety.requiresHumanApproval === true;
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: action.description,
          outcome: held ? 'PERMISSION_REQUIRED' : 'BLOCKED',
          detailEn: safety.blockReason || 'Action blocked by the security policy.',
          detailHi: 'सुरक्षा नीति द्वारा कार्य अवरुद्ध।',
          evidence: null,
          failureReason: held ? 'HUMAN_APPROVAL_REQUIRED' : safety.dangerCategory || 'BLOCKED_BY_POLICY',
        }),
      };
    }

    // Level-4 / approval-gated action that no human has authorized yet.
    const evaluation = PermissionGuard.evaluateAction(action, emergencyStop);
    if (!options?.approved && (evaluation.requiresHumanApproval || evaluation.securityLevel === 4)) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: action.description,
          outcome: 'PERMISSION_REQUIRED',
          detailEn: evaluation.blockReason || 'Explicit human approval is required before this action can run.',
          detailHi: 'इस कार्य को चलाने से पहले मानव की स्पष्ट स्वीकृति आवश्यक है।',
          evidence: null,
          failureReason: 'HUMAN_APPROVAL_REQUIRED',
        }),
      };
    }

    return null;
  }

  /** Runs one action against the real host. */
  async execute(action: ComputerAction, options?: HostExecuteOptions): Promise<HostActionResult> {
    const refusal = this.safetyRefusal(action, options);
    if (refusal) return refusal;

    try {
      switch (action.type) {
        case 'TERMINAL_COMMAND':
          return await this.runTerminalCommand(action);
        case 'READ_FILE':
          return await this.readFile(action);
        case 'EDIT_FILE':
          return await this.editFile(action);
        case 'RUN_TESTS':
          return await this.runTests(action);
        case 'TAKE_SCREENSHOT':
        case 'INSPECT_SCREEN':
          return await this.screenshot(action);
        case 'LAUNCH_APP':
          return await this.launchApp(action);
        case 'WAIT': {
          await new Promise((r) => setTimeout(r, 500));
          return {
            actionId: action.id,
            receipt: buildReceipt({
              action: action.type,
              target: action.description,
              outcome: 'VERIFIED',
              detailEn: 'Waited 500ms for the UI transition to settle.',
              detailHi: '500ms प्रतीक्षा पूर्ण।',
              evidence: makeEvidence('os_command', 'Timer elapsed as requested', { ref: 'WAIT 500ms' }),
            }),
          };
        }
        default: {
          const caps = hostActionCapabilities();
          const cap = caps[action.type];
          return this.unavailable(action, cap?.reason || `No host implementation for ${action.type}.`);
        }
      }
    } catch (err: any) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: action.description,
          outcome: 'FAILED',
          detailEn: `Host execution of ${action.type} threw: ${err?.message || err}`,
          detailHi: 'कार्य निष्पादन में त्रुटि हुई।',
          evidence: null,
          failureReason: 'UNEXPECTED_HOST_ERROR',
        }),
      };
    }
  }

  // ---- terminal -------------------------------------------------------------

  private async runTerminalCommand(action: ComputerAction): Promise<HostActionResult> {
    const command = (action.command || '').trim();
    if (!command) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: 'terminal',
          outcome: 'FAILED',
          detailEn: 'No command was supplied to execute.',
          detailHi: 'कोई कमांड नहीं दी गई।',
          evidence: null,
          failureReason: 'EMPTY_COMMAND',
        }),
      };
    }

    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/sh';
    const args = isWindows ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];

    const result = await runCommand(shell, args, this.workspaceRoot, this.commandTimeoutMs);
    const output = `${result.stdout}${result.stderr ? `\n[stderr]\n${result.stderr}` : ''}`.trim();

    if (result.timedOut) {
      return {
        actionId: action.id,
        output,
        exitCode: null,
        receipt: buildReceipt({
          action: action.type,
          target: command,
          outcome: 'FAILED',
          detailEn: `Command exceeded the ${this.commandTimeoutMs}ms limit and was killed.`,
          detailHi: 'कमांड समय सीमा से अधिक चली और रोक दी गई।',
          evidence: makeEvidence('os_command', `Timed out after ${this.commandTimeoutMs}ms`, { ref: command }),
          failureReason: 'COMMAND_TIMEOUT',
        }),
      };
    }

    const ok = result.code === 0;
    return {
      actionId: action.id,
      output,
      exitCode: result.code,
      receipt: buildReceipt({
        action: action.type,
        target: command,
        outcome: ok ? 'VERIFIED' : 'FAILED',
        detailEn: ok
          ? `Command exited 0. Output: ${output.slice(0, 300) || '(no output)'}`
          : `Command exited ${result.code}. ${result.stderr.slice(0, 300)}`,
        detailHi: ok ? 'कमांड सफलतापूर्वक पूरी हुई।' : 'कमांड विफल रही।',
        evidence: makeEvidence('os_command', `Exit code ${result.code} for: ${command}`, { ref: command }),
        failureReason: ok ? undefined : `EXIT_CODE_${result.code}`,
      }),
    };
  }

  // ---- files ----------------------------------------------------------------

  private async readFile(action: ComputerAction): Promise<HostActionResult> {
    const requested = action.filePath || '';
    const resolved = resolveWorkspacePath(this.workspaceRoot, requested);
    if (!resolved.ok) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: requested,
          outcome: 'BLOCKED',
          detailEn: resolved.reason,
          detailHi: 'फ़ाइल पथ कार्यक्षेत्र से बाहर है।',
          evidence: null,
          failureReason: 'PATH_OUTSIDE_WORKSPACE',
        }),
      };
    }

    if (!fs.existsSync(resolved.absolute) || !fs.statSync(resolved.absolute).isFile()) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: resolved.absolute,
          outcome: 'FAILED',
          detailEn: `No readable file at ${resolved.absolute}`,
          detailHi: 'फ़ाइल नहीं मिली।',
          evidence: null,
          failureReason: 'FILE_NOT_FOUND',
        }),
      };
    }

    const content = fs.readFileSync(resolved.absolute, 'utf-8');
    const stat = fs.statSync(resolved.absolute);
    return {
      actionId: action.id,
      output: content.slice(0, 500),
      receipt: buildReceipt({
        action: action.type,
        target: resolved.absolute,
        outcome: 'VERIFIED',
        detailEn: `Read ${stat.size} bytes from ${resolved.absolute}`,
        detailHi: `फ़ाइल पढ़ी गई: ${path.basename(resolved.absolute)}`,
        evidence: makeEvidence('local_file', `File read verified at ${resolved.absolute}`, {
          ref: resolved.absolute,
          sizeBytes: stat.size,
        }),
      }),
    };
  }

  private async editFile(action: ComputerAction): Promise<HostActionResult> {
    const requested = action.filePath || '';
    const resolved = resolveWorkspacePath(this.workspaceRoot, requested);
    if (!resolved.ok) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: requested,
          outcome: 'BLOCKED',
          detailEn: resolved.reason,
          detailHi: 'फ़ाइल पथ कार्यक्षेत्र से बाहर है।',
          evidence: null,
          failureReason: 'PATH_OUTSIDE_WORKSPACE',
        }),
      };
    }

    const diff = action.fileDiff;
    if (!diff || !diff.search) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: resolved.absolute,
          outcome: 'FAILED',
          detailEn: 'A search/replace pair is required to edit a file.',
          detailHi: 'संपादन के लिए search/replace आवश्यक है।',
          evidence: null,
          failureReason: 'MISSING_DIFF',
        }),
      };
    }

    if (!fs.existsSync(resolved.absolute)) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: resolved.absolute,
          outcome: 'FAILED',
          detailEn: `Cannot edit a file that does not exist: ${resolved.absolute}`,
          detailHi: 'फ़ाइल मौजूद नहीं है।',
          evidence: null,
          failureReason: 'FILE_NOT_FOUND',
        }),
      };
    }

    const before = fs.readFileSync(resolved.absolute, 'utf-8');
    const occurrences = before.split(diff.search).length - 1;
    if (occurrences === 0) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: resolved.absolute,
          outcome: 'FAILED',
          detailEn: `Search text was not found in ${resolved.absolute}; nothing was written.`,
          detailHi: 'खोजा गया पाठ नहीं मिला; कुछ नहीं बदला गया।',
          evidence: null,
          failureReason: 'SEARCH_TEXT_NOT_FOUND',
        }),
      };
    }
    if (occurrences > 1) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: resolved.absolute,
          outcome: 'BLOCKED',
          detailEn: `Search text appears ${occurrences} times; refusing an ambiguous edit.`,
          detailHi: 'खोजा गया पाठ कई जगह मिला; अस्पष्ट संपादन अस्वीकृत।',
          evidence: null,
          failureReason: 'AMBIGUOUS_EDIT',
        }),
      };
    }

    const after = before.replace(diff.search, diff.replacement);
    fs.writeFileSync(resolved.absolute, after, 'utf-8');

    // Re-read from disk: the claim is based on what was actually stored.
    const persisted = fs.readFileSync(resolved.absolute, 'utf-8');
    if (persisted !== after) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: resolved.absolute,
          outcome: 'FAILED',
          detailEn: `Write to ${resolved.absolute} did not persist as expected.`,
          detailHi: 'फ़ाइल लेखन सत्यापित नहीं हुआ।',
          evidence: null,
          failureReason: 'WRITE_NOT_PERSISTED',
        }),
      };
    }

    return {
      actionId: action.id,
      receipt: buildReceipt({
        action: action.type,
        target: resolved.absolute,
        outcome: 'VERIFIED',
        detailEn: `Edited ${path.basename(resolved.absolute)}; re-read from disk confirms the replacement.`,
        detailHi: `फ़ाइल संपादित एवं सत्यापित: ${path.basename(resolved.absolute)}`,
        evidence: makeEvidence(
          'local_file',
          `Re-read after write at ${resolved.absolute} (${Buffer.byteLength(after)} bytes)`,
          { ref: resolved.absolute, sizeBytes: Buffer.byteLength(after) }
        ),
      }),
    };
  }

  // ---- tests ----------------------------------------------------------------

  private async runTests(action: ComputerAction): Promise<HostActionResult> {
    const custom = (action.command || '').trim();
    const isWindows = process.platform === 'win32';
    const shell = isWindows ? 'powershell.exe' : '/bin/sh';
    // `npm` is a shell alias on Windows, so go through the shell there.
    const args = isWindows
      ? ['-NoProfile', '-NonInteractive', '-Command', custom || 'npm test']
      : ['-c', custom || 'npm test'];

    const result = await runCommand(shell, args, this.workspaceRoot, this.commandTimeoutMs);
    const output = `${result.stdout}\n${result.stderr}`.trim();

    // Parse the runner's own summary rather than assuming the tests passed.
    const passMatch = output.match(/(\d+)\s+passed/i);
    const failMatch = output.match(/(\d+)\s+failed/i);
    const passed = passMatch ? Number(passMatch[1]) : null;
    const failed = failMatch ? Number(failMatch[1]) : null;
    const ok = result.code === 0 && (failed === null || failed === 0) && !result.timedOut;

    const summary =
      passed !== null || failed !== null
        ? `${passed ?? 0} passed, ${failed ?? 0} failed`
        : output.slice(-400) || '(no test summary parsed)';

    return {
      actionId: action.id,
      output: output.slice(0, 4000),
      exitCode: result.code,
      receipt: buildReceipt({
        action: action.type,
        target: 'vitest',
        outcome: ok ? 'VERIFIED' : 'FAILED',
        detailEn: ok
          ? `Test suite passed: ${summary}`
          : `Test suite failed (exit ${result.code}): ${summary}`,
        detailHi: ok ? `टेस्ट सूट पास हुआ: ${summary}` : `टेस्ट सूट विफल: ${summary}`,
        evidence: makeEvidence('os_command', `Runner output parsed: ${summary}`, { ref: 'npm test' }),
        failureReason: ok ? undefined : 'TESTS_FAILED',
      }),
    };
  }

  // ---- screenshot -----------------------------------------------------------

  private async screenshot(action: ComputerAction): Promise<HostActionResult> {
    const result = await captureScreenshot({ label: action.targetApp || 'operator' });
    return {
      actionId: action.id,
      receipt: result.receipt,
      output: result.file ? result.file.absolutePath : undefined,
    };
  }

  // ---- app launch -----------------------------------------------------------

  private async launchApp(action: ComputerAction): Promise<HostActionResult> {
    const target = (action.targetApp || '').trim();
    if (!target) {
      return {
        actionId: action.id,
        receipt: buildReceipt({
          action: action.type,
          target: 'unknown',
          outcome: 'FAILED',
          detailEn: 'No application name was supplied to launch.',
          detailHi: 'लॉन्च करने के लिए ऐप का नाम नहीं दिया गया।',
          evidence: null,
          failureReason: 'MISSING_TARGET_APP',
        }),
      };
    }

    const isWindows = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    if (!isWindows && !isMac && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
      return this.unavailable(action, 'No desktop session is available to launch applications.');
    }

    const launch: { command: string; args: string[] } = isWindows
      ? {
          command: 'powershell.exe',
          args: ['-NoProfile', '-NonInteractive', '-Command', `Start-Process '${target.replace(/'/g, "''")}'`],
        }
      : isMac
      ? { command: 'open', args: ['-a', target] }
      : { command: 'xdg-open', args: [target] };

    const result = await runCommand(launch.command, launch.args, this.workspaceRoot, 20_000);
    const launched = result.code === 0;

    // A successful spawn does not prove the window has focus, so the outcome is
    // DISPATCHED unless we can independently observe the app in the foreground.
    const host = await probeHostState();
    const observed = host.activeApplication?.toLowerCase().includes(target.toLowerCase()) ?? false;

    if (!launched) {
      return {
        actionId: action.id,
        exitCode: result.code,
        receipt: buildReceipt({
          action: action.type,
          target,
          outcome: 'FAILED',
          detailEn: `Launch of "${target}" failed (exit ${result.code}): ${result.stderr.slice(0, 200)}`,
          detailHi: `"${target}" लॉन्च नहीं हो सका।`,
          evidence: null,
          failureReason: 'LAUNCH_COMMAND_FAILED',
        }),
      };
    }

    if (observed) {
      return {
        actionId: action.id,
        exitCode: 0,
        receipt: buildReceipt({
          action: action.type,
          target,
          outcome: 'VERIFIED',
          detailEn: `"${target}" is now the foreground application.`,
          detailHi: `"${target}" अब सामने खुला है।`,
          evidence: makeEvidence('os_command', `Foreground window is "${host.activeApplication}"`, {
            ref: host.activeApplication || target,
          }),
        }),
      };
    }

    return {
      actionId: action.id,
      exitCode: 0,
      receipt: buildReceipt({
        action: action.type,
        target,
        outcome: 'DISPATCHED',
        detailEn: `Launch command for "${target}" succeeded, but the app is not yet in the foreground (unconfirmed).`,
        detailHi: `"${target}" के लॉन्च का निर्देश भेज दिया गया; पुष्टि बाकी है।`,
        evidence: null,
      }),
    };
  }

  /** Observation of the real host, used before and after actions. */
  async observe(): Promise<ScreenObservation> {
    return describeHostScreen(this.workspaceRoot);
  }

  /**
   * Adapter satisfying the operator engine's `ActionBackend` contract, so the
   * server can install this executor directly via
   * `ComputerOperatorEngine.setExecutor(...)`.
   */
  async executeAction(action: ComputerAction, options?: HostExecuteOptions): Promise<{
    success: boolean;
    message: string;
    output?: string;
    error?: string;
  }> {
    const result = await this.execute(action, options);
    return {
      success: result.receipt.verified,
      message: result.receipt.detailEn,
      output: result.output,
      error: result.receipt.outcome === 'FAILED' ? result.receipt.failureReason : undefined,
    };
  }
}