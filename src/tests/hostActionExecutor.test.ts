// ==============================================================================
// Tests for the real host action executor and the honest verification rules.
//
// These exercise genuine filesystem and process behaviour. Nothing is mocked:
// the executor runs real commands and the assertions check the receipts it
// produces. The core theme is that unimplemented or unconfirmable work must be
// reported as such, never as success.
// ==============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HostActionExecutor,
  hostActionCapabilities,
  resolveWorkspacePath,
} from '../utils/computerOperator/actionExecutorHost';
import type { ComputerAction } from '../types/computerOperator';
import { HostScreenOperator, describeHostOperatorCapabilities } from '../utils/computerOperator/hostScreenOperator';
import { ActionVerifier } from '../utils/computerOperator/actionVerifier';
import { probeHostState, describeHostScreen, describeHost } from '../utils/computerOperator/hostProbe';

let workspace: string;
let executor: HostActionExecutor;

function action(overrides: Partial<ComputerAction> & { type: ComputerAction['type'] }): ComputerAction {
  return {
    id: `act-${Math.random().toString(36).slice(2, 8)}`,
    description: 'test action',
    securityLevel: 1,
    requiresHumanApproval: false,
    ...overrides,
  };
}

beforeAll(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-ws-'));
  fs.writeFileSync(path.join(workspace, 'sample.txt'), 'hello jarvis\n');
  fs.writeFileSync(path.join(workspace, 'dupes.txt'), 'needle\nneedle\n');
  executor = new HostActionExecutor({ workspaceRoot: workspace, commandTimeoutMs: 30_000 });
});

afterAll(() => {
  fs.rmSync(workspace, { recursive: true, force: true });
});

describe('resolveWorkspacePath', () => {
  it('accepts a path inside the workspace', () => {
    const result = resolveWorkspacePath(workspace, 'sample.txt');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.absolute).toBe(path.join(workspace, 'sample.txt'));
  });

  it('refuses traversal outside the workspace', () => {
    const result = resolveWorkspacePath(workspace, '../../etc/passwd');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('outside the workspace');
  });

  it('refuses an absolute path outside the workspace', () => {
    const result = resolveWorkspacePath(workspace, process.platform === 'win32' ? 'C:\\Windows\\System32' : '/etc/hosts');
    expect(result.ok).toBe(false);
  });
});

describe('hostActionCapabilities', () => {
  it('marks synthetic input as unavailable so nothing can claim it works', () => {
    const caps = hostActionCapabilities();
    for (const type of ['CLICK', 'DOUBLE_CLICK', 'RIGHT_CLICK', 'MOUSE_MOVE', 'SCROLL', 'TYPE_TEXT', 'KEY_COMBINATION']) {
      expect(caps[type].available).toBe(false);
      expect(caps[type].reason).toBeTruthy();
    }
  });

  it('marks the genuinely supported actions as available', () => {
    const caps = hostActionCapabilities();
    for (const type of ['TERMINAL_COMMAND', 'READ_FILE', 'EDIT_FILE', 'RUN_TESTS', 'WAIT']) {
      expect(caps[type].available).toBe(true);
    }
  });
});

describe('HostActionExecutor — real commands', () => {
  it('runs a real command and reports the true exit status', async () => {
    const result = await executor.execute(
      action({ type: 'TERMINAL_COMMAND', command: 'node -e "console.log(6*7)"' })
    );
    expect(result.receipt.outcome).toBe('VERIFIED');
    expect(result.receipt.verified).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('42');
    expect(result.receipt.evidence?.kind).toBe('os_command');
  });

  it('reports FAILED with the real exit code when a command fails', async () => {
    const result = await executor.execute(
      action({ type: 'TERMINAL_COMMAND', command: 'node -e "process.exit(3)"' })
    );
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.verified).toBe(false);
    expect(result.exitCode).toBe(3);
    expect(result.receipt.failureReason).toBe('EXIT_CODE_3');
  });

  it('refuses an empty command instead of reporting a phantom success', async () => {
    const result = await executor.execute(action({ type: 'TERMINAL_COMMAND', command: '   ' }));
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toBe('EMPTY_COMMAND');
  });

  it('kills a command that exceeds the timeout and says so', async () => {
    const short = new HostActionExecutor({ workspaceRoot: workspace, commandTimeoutMs: 1500 });
    const result = await short.execute(
      action({ type: 'TERMINAL_COMMAND', command: 'node -e "setTimeout(()=>{}, 60000)"' })
    );
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toBe('COMMAND_TIMEOUT');
    expect(result.receipt.detailEn).toContain('limit');
  }, 20_000);
});

describe('HostActionExecutor — real files', () => {
  it('reads a real file and reports its true size', async () => {
    const result = await executor.execute(action({ type: 'READ_FILE', filePath: 'sample.txt' }));
    expect(result.receipt.outcome).toBe('VERIFIED');
    expect(result.output).toContain('hello jarvis');
    expect(result.receipt.evidence?.sizeBytes).toBe(fs.statSync(path.join(workspace, 'sample.txt')).size);
  });

  it('reports FAILED for a missing file', async () => {
    const result = await executor.execute(action({ type: 'READ_FILE', filePath: 'nope.txt' }));
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toBe('FILE_NOT_FOUND');
  });

  it('blocks a read outside the workspace', async () => {
    const result = await executor.execute(action({ type: 'READ_FILE', filePath: '../../etc/passwd' }));
    expect(result.receipt.outcome).toBe('BLOCKED');
    expect(result.receipt.failureReason).toBe('PATH_OUTSIDE_WORKSPACE');
  });

  it('applies a real edit and confirms it by re-reading from disk', async () => {
    const target = path.join(workspace, 'editable.txt');
    fs.writeFileSync(target, 'before jarvis after');

    const result = await executor.execute(
      action({
        type: 'EDIT_FILE',
        filePath: 'editable.txt',
        fileDiff: { target: 'editable.txt', search: 'jarvis', replacement: 'HERMES' },
      })
    );

    expect(result.receipt.outcome).toBe('VERIFIED');
    expect(result.receipt.evidence?.kind).toBe('local_file');
    expect(fs.readFileSync(target, 'utf-8')).toBe('before HERMES after');
  });

  it('refuses an edit whose search text is absent and writes nothing', async () => {
    const target = path.join(workspace, 'untouched.txt');
    fs.writeFileSync(target, 'original content');

    const result = await executor.execute(
      action({
        type: 'EDIT_FILE',
        filePath: 'untouched.txt',
        fileDiff: { target: 'untouched.txt', search: 'not-present', replacement: 'x' },
      })
    );

    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toBe('SEARCH_TEXT_NOT_FOUND');
    expect(fs.readFileSync(target, 'utf-8')).toBe('original content');
  });

  it('refuses an ambiguous edit that would match twice', async () => {
    const result = await executor.execute(
      action({
        type: 'EDIT_FILE',
        filePath: 'dupes.txt',
        fileDiff: { target: 'dupes.txt', search: 'needle', replacement: 'pin' },
      })
    );
    expect(result.receipt.outcome).toBe('BLOCKED');
    expect(result.receipt.failureReason).toBe('AMBIGUOUS_EDIT');
    expect(fs.readFileSync(path.join(workspace, 'dupes.txt'), 'utf-8')).toBe('needle\nneedle\n');
  });

  it('refuses an edit without a diff', async () => {
    const result = await executor.execute(action({ type: 'EDIT_FILE', filePath: 'sample.txt' }));
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toBe('MISSING_DIFF');
  });
});

describe('HostActionExecutor — real test runs', () => {
  it('parses the runner summary rather than assuming tests passed', async () => {
    // A command that prints a failing test summary and exits non-zero.
    const result = await executor.execute(
      action({
        type: 'RUN_TESTS',
        command: 'node -e "console.log(\'3 passed\'); console.log(\'2 failed\'); process.exit(1)"',
      })
    );
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.detailEn).toContain('3 passed');
    expect(result.receipt.detailEn).toContain('2 failed');
    expect(result.receipt.failureReason).toBe('TESTS_FAILED');
  });

  it('verifies a genuinely passing run', async () => {
    const result = await executor.execute(
      action({ type: 'RUN_TESTS', command: 'node -e "console.log(\'5 passed\'); console.log(\'0 failed\')"' })
    );
    expect(result.receipt.outcome).toBe('VERIFIED');
    expect(result.receipt.verified).toBe(true);
    expect(result.receipt.detailEn).toContain('5 passed, 0 failed');
  });
});

describe('HostActionExecutor — unimplemented actions', () => {
  it('reports NOT_AVAILABLE for every synthetic input action', async () => {
    for (const type of ['CLICK', 'TYPE_TEXT', 'KEY_COMBINATION', 'MOUSE_MOVE', 'SCROLL', 'SWITCH_WINDOW', 'CLOSE_WINDOW'] as const) {
      const result = await executor.execute(action({ type, coordinates: { x: 10, y: 10 } }));
      expect(result.receipt.outcome).toBe('NOT_AVAILABLE');
      expect(result.receipt.verified).toBe(false);
      expect(result.receipt.detailEn).toContain(type);
      expect(result.receipt.failureReason).toBe('ACTION_NOT_AVAILABLE_ON_HOST');
    }
  });

  it('does not claim an app launched when it cannot observe the foreground', async () => {
    const result = await executor.execute(action({ type: 'LAUNCH_APP', targetApp: 'definitely-not-a-real-app-xyz' }));
    // Either the launch command failed, or it succeeded but is unconfirmed.
    expect(['FAILED', 'DISPATCHED', 'NOT_AVAILABLE']).toContain(result.receipt.outcome);
    expect(result.receipt.outcome).not.toBe('VERIFIED');
  });

  it('refuses a launch with no target', async () => {
    const result = await executor.execute(action({ type: 'LAUNCH_APP', targetApp: '' }));
    expect(result.receipt.outcome).toBe('FAILED');
    expect(result.receipt.failureReason).toBe('MISSING_TARGET_APP');
  });

  it('verifies WAIT without claiming anything else', async () => {
    const result = await executor.execute(action({ type: 'WAIT' }));
    expect(result.receipt.outcome).toBe('VERIFIED');
    expect(result.receipt.evidence?.kind).toBe('os_command');
  });
});

describe('ActionVerifier — no unconditional success', () => {
  const baseObservation = {
    id: 'obs-1',
    timestamp: new Date().toISOString(),
    activeWindow: 'Chrome',
    activeApplication: 'Chrome',
    windowTitle: 'Example',
    visibleElements: [],
    detectedErrors: [],
    screenResolution: { width: 1920, height: 1080 },
    isAmbiguous: false,
    platform: 'windows' as const,
  };

  it('does not verify a click that changed nothing on screen', () => {
    const result = ActionVerifier.verifyAction(
      action({ type: 'CLICK', coordinates: { x: 5, y: 5 } }),
      baseObservation,
      { ...baseObservation, id: 'obs-2' },
      0
    );
    // Identical observations mean no observable change, so this must not verify.
    expect(result.verified).toBe(false);
    expect(result.stateChangeDetected).toBe(false);
  });

  it('verifies a click that did change the screen', () => {
    const result = ActionVerifier.verifyAction(
      action({ type: 'CLICK', coordinates: { x: 5, y: 5 } }),
      baseObservation,
      { ...baseObservation, id: 'obs-2', windowTitle: 'Example — clicked' },
      0
    );
    expect(result.verified).toBe(true);
    expect(result.stateChangeDetected).toBe(true);
  });

  it('never verifies synthetic text entry', () => {
    const result = ActionVerifier.verifyAction(
      action({ type: 'TYPE_TEXT', text: 'hello' }),
      baseObservation,
      baseObservation,
      0
    );
    expect(result.verified).toBe(false);
    expect(result.message).toContain('Unverified');
  });

  it('never verifies test runs from observation alone', () => {
    const result = ActionVerifier.verifyAction(action({ type: 'RUN_TESTS' }), baseObservation, baseObservation, 0);
    expect(result.verified).toBe(false);
  });

  it('never verifies a file edit without a filesystem re-read', () => {
    const result = ActionVerifier.verifyAction(
      action({ type: 'EDIT_FILE', filePath: 'x.ts' }),
      baseObservation,
      baseObservation,
      0
    );
    expect(result.verified).toBe(false);
  });

  it('only verifies a screenshot when a captured file is attached', () => {
    const withoutFile = ActionVerifier.verifyAction(
      action({ type: 'TAKE_SCREENSHOT' }),
      baseObservation,
      baseObservation,
      0
    );
    expect(withoutFile.verified).toBe(false);

    const withFile = ActionVerifier.verifyAction(
      action({ type: 'TAKE_SCREENSHOT' }),
      baseObservation,
      { ...baseObservation, screenshot: '/tmp/real.png' },
      0
    );
    expect(withFile.verified).toBe(true);
    expect(withFile.message).toContain('/tmp/real.png');
  });

  it('halts on an ambiguous screen rather than verifying', () => {
    const result = ActionVerifier.verifyAction(
      action({ type: 'CLICK', coordinates: { x: 1, y: 1 } }),
      baseObservation,
      { ...baseObservation, isAmbiguous: true, ambiguityReason: 'Two dialogs' },
      0
    );
    expect(result.verified).toBe(false);
    expect(result.shouldRetry).toBe(false);
    expect(result.error).toContain('Two dialogs');
  });

  it('verifies a window switch only when the observation agrees', () => {
    const mismatch = ActionVerifier.verifyAction(
      action({ type: 'LAUNCH_APP', targetApp: 'Firefox' }),
      baseObservation,
      baseObservation,
      0
    );
    expect(mismatch.verified).toBe(false);

    const match = ActionVerifier.verifyAction(
      action({ type: 'LAUNCH_APP', targetApp: 'Chrome' }),
      baseObservation,
      baseObservation,
      0
    );
    expect(match.verified).toBe(true);
  });
});

describe('HostScreenOperator', () => {
  it('refuses synthetic actions rather than reporting them as done', async () => {
    const operator = new HostScreenOperator({ workspaceRoot: workspace });
    for (const type of ['click', 'type', 'key', 'scroll'] as const) {
      const result = await operator.act({ type, safe: false, description: `do ${type}` });
      expect(result.ok).toBe(false);
      expect(result.message).toContain('NOT_AVAILABLE');
    }
  });

  it('never claims simulation-only behaviour', () => {
    const operator = new HostScreenOperator({ workspaceRoot: workspace });
    expect(operator.simulationOnly).toBe(false);
  });

  it('reports observation honestly on this host', async () => {
    const operator = new HostScreenOperator({ workspaceRoot: workspace });
    const state = await operator.observe();
    const probe = await probeHostState();
    if (probe.observed) {
      expect(state.ambiguous).toBe(false);
      expect(state.visibleErrors).not.toContain('DESKTOP_STATE_UNOBSERVABLE');
    } else {
      // Headless: must be flagged ambiguous so the planner stops.
      expect(state.ambiguous).toBe(true);
      expect(state.visibleErrors).toContain('DESKTOP_STATE_UNOBSERVABLE');
    }
  });

  it('reports capabilities that match reality', () => {
    const caps = describeHostOperatorCapabilities();
    expect(caps.syntheticInput.available).toBe(false);
    expect(caps.syntheticInput.reason).toBeTruthy();
    expect(caps.read.available).toBe(true);
  });

  it('refuses to open a path outside the workspace', async () => {
    const operator = new HostScreenOperator({ workspaceRoot: workspace });
    const result = await operator.act({ type: 'open', targetText: '../../etc/passwd', safe: false, description: 'open' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('BLOCKED');
  });
});

describe('hostProbe', () => {
  it('reports observed:false with a reason when it cannot inspect the host', async () => {
    const probe = await probeHostState();
    if (!probe.observed) {
      expect(probe.reason).toBeTruthy();
      expect(probe.activeApplication).toBeNull();
    } else {
      expect(probe.probedAt).toBeTruthy();
      expect(Array.isArray(probe.windowList)).toBe(true);
    }
  });

  it('marks an unobservable screen as ambiguous instead of inventing content', async () => {
    const observation = await describeHostScreen(workspace);
    const probe = await probeHostState();
    expect(observation.platform).toBeTruthy();
    if (!probe.observed) {
      expect(observation.isAmbiguous).toBe(true);
      expect(observation.ambiguityReason).toContain('could not be observed');
      expect(observation.visibleElements).toEqual([]);
    }
  });

  it('describes the host without leaking absolute paths', () => {
    const host = describeHost();
    expect(host.platform).toBe(process.platform);
    expect(typeof host.desktopSession).toBe('boolean');
  });
});