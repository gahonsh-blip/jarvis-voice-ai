// ==============================================================================
// Zero-fake-success guards for the Screen-Research engine's completion paths.
//
// Two surfaces used to assert success unconditionally:
//   * the final COMPLETED summary claimed every step was "visually verified" and
//     that the "system state" was nominal, even when the only frames available
//     came from the built-in illustrative observer;
//   * resumeApprovedTask marked the task COMPLETED without awaiting or reading
//     the executor result, so a failed approved action still read as verified.
//
// These tests pin the honest behaviour: the illustrative view is labelled
// SIMULATION_ONLY, a host-backed observation is allowed to claim verification,
// and a failed approved action ends the task FAILED.
// ==============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import {
  ComputerOperatorEngine,
  type ActionBackend,
} from '../utils/computerOperator/computerOperatorEngine';
import { ScreenObserver, type ObservationSource } from '../utils/computerOperator/screenObserver';
import type { ComputerOperatorTask } from '../types/computerOperator';

const originalExecutor = ComputerOperatorEngine.getExecutor();

const stubExecutor = (success: boolean, error?: string): ActionBackend => ({
  executeAction: async () => ({ success, message: success ? 'done' : 'failed', error }),
});

const hostSource: ObservationSource = async () => ({
  id: 'host-obs',
  timestamp: new Date().toISOString(),
  activeWindow: 'Terminal',
  activeApplication: 'Terminal',
  windowTitle: 'Terminal',
  visibleElements: [],
  detectedErrors: [],
  screenResolution: { width: 1920, height: 1080 },
  isAmbiguous: false,
  platform: 'linux',
});

afterEach(() => {
  ScreenObserver.setSource(null);
  ComputerOperatorEngine.setExecutor(originalExecutor);
});

/** Single-step objective whose only action is a Level-1 window switch. */
const SWITCH_OBJECTIVE = 'open browser';

/** Runs a task and returns the task handle stored by the tracker. */
async function finish(objective: string, stub: ActionBackend): Promise<ComputerOperatorTask> {
  ComputerOperatorEngine.setExecutor(stub);
  const returned = await ComputerOperatorEngine.executeTask(objective, 'hybrid', false);
  // TaskTracker publishes a copy on every event; the stored record is authoritative.
  return returned;
}

describe('engine final summary is honest about screen provenance', () => {
  it('labels the illustrative view as SIMULATION_ONLY and never claims visual verification', async () => {
    // No observation source installed: ScreenObserver returns the built-in view.
    const task = await finish(SWITCH_OBJECTIVE, stubExecutor(true));

    expect(ScreenObserver.isHostBacked()).toBe(false);
    expect(task.status).toBe('COMPLETED');
    expect(task.resultSummary).toContain('SIMULATION_ONLY');
    expect(task.resultSummary).not.toMatch(/verified against the host desktop/i);
    expect(task.resultSummary).not.toMatch(/state nominal/i);
    expect(task.resultSummary).toMatch(/was not visually verified/i);
  });

  it('allows a verification claim once a host-backed observer is installed', async () => {
    ScreenObserver.setSource(hostSource);
    const task = await finish(SWITCH_OBJECTIVE, stubExecutor(true));

    expect(ScreenObserver.isHostBacked()).toBe(true);
    expect(task.resultSummary).toMatch(/verified against the host desktop/i);
    expect(task.resultSummary).not.toContain('SIMULATION_ONLY');
  });
});

describe('resumeApprovedTask reports the real executor outcome', () => {
  /** Runs a Level-4 objective to the approval hold and returns the task. */
  async function held(stub: ActionBackend): Promise<ComputerOperatorTask> {
    const task = await finish('delete the temporary build folder', stub);
    expect(task.status).toBe('NEEDS_APPROVAL');
    expect(task.plan).toBeTruthy();
    return task;
  }

  it('does not mark a failed approved action as completed', async () => {
    const task = await held(stubExecutor(false, 'EXECUTOR_REJECTED'));
    const resumed = await ComputerOperatorEngine.resumeApprovedTask(task.taskId);

    expect(resumed).not.toBeNull();
    expect(resumed!.status).toBe('FAILED');
    expect(resumed!.error).toBe('EXECUTOR_REJECTED');
    expect(resumed!.resultSummary ?? '').not.toMatch(/completed and verified/i);
  });

  it('labels a successful approval on the illustrative view as SIMULATION_ONLY', async () => {
    const task = await held(stubExecutor(true));
    const resumed = await ComputerOperatorEngine.resumeApprovedTask(task.taskId);

    expect(resumed!.status).toBe('COMPLETED');
    expect(resumed!.resultSummary).toContain('SIMULATION_ONLY');
    expect(resumed!.resultSummary).not.toMatch(/verified against the host desktop/i);
  });

  it('only claims verification for a successful approval on a host-backed observer', async () => {
    ScreenObserver.setSource(hostSource);
    const task = await held(stubExecutor(true));
    const resumed = await ComputerOperatorEngine.resumeApprovedTask(task.taskId);

    expect(resumed!.status).toBe('COMPLETED');
    expect(resumed!.resultSummary).toMatch(/verified against the host desktop/i);
  });

  it('refuses to resume a task that is not awaiting approval', async () => {
    const task = await finish(SWITCH_OBJECTIVE, stubExecutor(true));
    expect(await ComputerOperatorEngine.resumeApprovedTask(task.taskId)).toBeNull();
  });
});
