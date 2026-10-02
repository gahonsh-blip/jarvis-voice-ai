// ==============================================================================
// Zero-fake-success guard for `POST /api/computer-operator/execute`.
//
// The route used to answer `{ success: true, task }` for every run, reading the
// engine's terminal state out of the picture: a FAILED run, a BLOCKED one, a run
// held for approval, or one that was cancelled all reported `success: true`. The
// flag now follows the engine verdict via `operatorTaskExecuted`, and the route
// names that verdict in `outcome`.
// ==============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ComputerOperatorEngine,
  type ActionBackend,
} from '../utils/computerOperator/computerOperatorEngine';
import { operatorTaskExecuted } from '../utils/computerOperator/operatorReplyTruth';
import { ScreenObserver, type ObservationSource } from '../utils/computerOperator/screenObserver';

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

/** The execute route body, bounded so the flat checks do not match sibling routes. */
const executeRoute = (() => {
  const start = flat.indexOf("app.post('/api/computer-operator/execute',");
  const end = flat.indexOf("app.post('/api/computer-operator/observe'", start);
  return flat.slice(start, end);
})();

const originalExecutor = ComputerOperatorEngine.getExecutor();

const stubExecutor = (success: boolean): ActionBackend => ({
  executeAction: async () => ({ success, message: success ? 'done' : 'failed', error: success ? undefined : 'host refused' }),
});

/** A host-backed observation whose foreground app never changes. */
const staticHostSource = (isAmbiguous = false): ObservationSource => async () => ({
  id: 'host-obs',
  timestamp: new Date().toISOString(),
  activeWindow: 'Terminal',
  activeApplication: 'Terminal',
  windowTitle: 'Terminal',
  visibleElements: [],
  detectedErrors: [],
  screenResolution: { width: 1920, height: 1080 },
  isAmbiguous,
  ambiguityReason: isAmbiguous ? 'two unconfirmed dialogs' : undefined,
  platform: 'linux',
});

/** Host observation source whose foreground app advances through a fixed sequence. */
const sequencedHostSource = (apps: string[]): ObservationSource => {
  let call = 0;
  return async () => {
    const app = apps[Math.min(call, apps.length - 1)];
    call += 1;
    return {
      id: `host-obs-${call}`,
      timestamp: new Date().toISOString(),
      activeWindow: app,
      activeApplication: app,
      windowTitle: app,
      visibleElements: [],
      detectedErrors: [],
      screenResolution: { width: 1920, height: 1080 },
      isAmbiguous: false,
      platform: 'linux',
    };
  };
};

afterEach(() => {
  ScreenObserver.setSource(null);
  ComputerOperatorEngine.setExecutor(originalExecutor);
});

describe('the execute route maps its success flag to the engine verdict', () => {
  it('does not answer a flat success: true for every task', () => {
    // The old body was `res.json({ success: true, task })`.
    expect(executeRoute).not.toContain('res.json({ success: true, task })');
    expect(executeRoute).toContain('success: operatorTaskExecuted(task)');
  });

  it('reports success only for a COMPLETED run', async () => {
    ComputerOperatorEngine.setExecutor(stubExecutor(true));
    // The step is verified only when the foreground app actually changes.
    ScreenObserver.setSource(sequencedHostSource(['Terminal', 'Chrome']));
    const task = await ComputerOperatorEngine.executeTask('open browser', 'hybrid', false);
    expect(task.status).toBe('COMPLETED');
    expect(operatorTaskExecuted(task)).toBe(true);
  });

  it('reports failure for a FAILED run instead of success', async () => {
    ComputerOperatorEngine.setExecutor(stubExecutor(false));
    ScreenObserver.setSource(staticHostSource());
    const task = await ComputerOperatorEngine.executeTask('open browser', 'hybrid', false);
    expect(task.status).toBe('FAILED');
    expect(operatorTaskExecuted(task)).toBe(false);
  });

  it('reports failure for a BLOCKED (ambiguous screen) run instead of success', async () => {
    ComputerOperatorEngine.setExecutor(stubExecutor(true));
    ScreenObserver.setSource(staticHostSource(true));
    const task = await ComputerOperatorEngine.executeTask('open browser', 'hybrid', false);
    expect(task.status).toBe('BLOCKED');
    expect(operatorTaskExecuted(task)).toBe(false);
  });

  it('reports failure for a task held for approval instead of success', async () => {
    ComputerOperatorEngine.setExecutor(stubExecutor(true));
    ScreenObserver.setSource(staticHostSource());
    // A Level-4 objective halts at NEEDS_APPROVAL before any action runs.
    const task = await ComputerOperatorEngine.executeTask('delete the temporary build folder', 'hybrid', false);
    expect(task.status).toBe('NEEDS_APPROVAL');
    expect(operatorTaskExecuted(task)).toBe(false);
  });
});
