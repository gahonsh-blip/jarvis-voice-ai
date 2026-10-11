// ==============================================================================
// Zero-fake-success guard for Computer-Operator task persistence.
//
// The operator engine wrote every terminal task to localStorage through
// `saveOperatorTask` / `recordOperatorAudit`, both of which returned `void` and
// swallowed a storage error. On a full disk, in private mode, or on the server
// (no `localStorage` at all) the write never landed, yet the run was still
// announced as a COMPLETED task the UI and the audit log would both treat as a
// durable record. The writers now report the real result, the terminal task is
// stamped with `taskPersisted`, and App.tsx names a missing record instead of
// implying a save it did not verify.
// ==============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  executeOperatorTask,
  planScreenActions,
  persistOperatorTaskState,
  saveOperatorTask,
  recordOperatorAudit,
  SimulatedScreenAdapter,
  type OperatorTask,
  type ScreenState,
} from '../utils/computerOperatorEngine';
import { executePlannedOperatorRun, planOperatorRun } from '../utils/operatorChatIntegration';

// A localStorage stand-in whose writes can be forced to fail, mirroring the
// harness used by offlinePersistenceTruth.test.ts.
class ControllableStorage {
  private store = new Map<string, string>();
  failWrites = false;
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException('QuotaExceededError');
    this.store.set(key, String(value));
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
}

const store = new ControllableStorage();

function makeState(overrides: Partial<ScreenState> = {}): ScreenState {
  return { id: 'screen-1', elements: [], visibleErrors: [], dialogs: [], ambiguous: false, ...overrides };
}

function terminalTask(overrides: Partial<OperatorTask> = {}): OperatorTask {
  return {
    taskId: 'task-persist',
    timestamp: new Date().toISOString(),
    intent: 'COMPUTER_OPERATION',
    status: 'COMPLETED',
    state: null,
    actions: [],
    actionIndex: 0,
    verificationResult: null,
    approvalState: 'NOT_REQUIRED',
    ...overrides,
  };
}

beforeEach(() => {
  store.clear();
  store.failWrites = false;
  vi.stubGlobal('window', {});
  vi.stubGlobal('localStorage', store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('operator persistence writers report whether the write landed', () => {
  it('returns true and stamps the task when the writes are accepted', () => {
    const task = terminalTask();
    expect(persistOperatorTaskState(task)).toBe(true);
    expect(task.taskPersisted).toBe(true);
  });

  it('returns false and stamps the task when localStorage refuses the write', () => {
    const task = terminalTask();
    store.failWrites = true;
    expect(saveOperatorTask(task)).toBe(false);
    expect(recordOperatorAudit(task)).toBe(false);
    expect(persistOperatorTaskState(task)).toBe(false);
    expect(task.taskPersisted).toBe(false);
  });

  it('returns false when there is no browser window (SSR / server)', () => {
    const task = terminalTask();
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('localStorage', undefined);
    expect(saveOperatorTask(task)).toBe(false);
    expect(recordOperatorAudit(task)).toBe(false);
    expect(persistOperatorTaskState(task)).toBe(false);
    expect(task.taskPersisted).toBe(false);
  });
});

describe('executeOperatorTask stamps terminal tasks with the real write result', () => {
  const plan = () => planScreenActions('screen inspect karo', makeState(), { read: true, control: true });

  it('reports a COMPLETED task as persisted only when storage accepted it', async () => {
    const result = await executeOperatorTask(new SimulatedScreenAdapter(makeState()), 'inspect screen', plan(), {
      taskId: 'engine-persisted',
      killSwitchActive: false,
    });
    expect(result.ok).toBe(true);
    expect(result.task.status).toBe('COMPLETED');
    expect(result.task.taskPersisted).toBe(true);
  });

  it('marks a COMPLETED task not-persisted on the server where localStorage is absent', async () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('localStorage', undefined);
    const result = await executeOperatorTask(new SimulatedScreenAdapter(makeState()), 'inspect screen', plan(), {
      taskId: 'engine-server',
      killSwitchActive: false,
    });
    expect(result.ok).toBe(true);
    expect(result.task.status).toBe('COMPLETED');
    expect(result.task.taskPersisted).toBe(false);
  });
});

describe('executePlannedOperatorRun persists blocked runs and reports honestly', () => {
  it('persists a kill-switch BLOCKED task and stamps the write result', async () => {
    const run = await planOperatorRun('Open VS Code.');
    const result = await executePlannedOperatorRun('Open VS Code.', run, {
      taskId: 'blocked-persist',
      killSwitchActive: true,
    });
    expect(result.ok).toBe(false);
    expect(result.task.status).toBe('BLOCKED');
    expect(result.task.taskPersisted).toBe(true);
    expect(store.getItem('hermes_jarvis_operator_audit_v1')).toContain('BLOCKED');
  });
});

// Pins the App.tsx surface so the "run record not saved" disclosure cannot be
// silently dropped. A source scan is used because App.tsx is a large React
// entry the suite does not mount.
describe('App.tsx discloses an operator run that was not persisted', () => {
  const fs = require('fs');
  const path = require('path');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const appFlat = appSource.replace(/\s+/g, ' ');

  it('branches the operator run announcement on the persistence result', () => {
    expect(appFlat).toContain('task.taskPersisted !== true');
    expect(appFlat).toContain('RUN RECORD NOT SAVED LOCALLY (STORAGE UNAVAILABLE)');
  });

  it('routes both operator result sites through the disclosing announcer', () => {
    const calls = [...appFlat.matchAll(/announceOperatorResult\(result\.task, result\.ok\)/g)].length;
    expect(calls).toBe(2);
  });
});
