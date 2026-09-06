import { describe, it, expect } from 'vitest';
import assert from 'node:assert';
import {
  classifyCommandIntent,
  isCancelCommand,
  detectDangerousIntent,
  planScreenActions,
  executeOperatorTask,
  redactSecrets,
  SimulatedScreenAdapter,
  NotConfiguredScreenOperator,
} from '../utils/computerOperatorEngine';
import type { ScreenState, OperatorAction, ActionResult, VerificationResult, ScreenOperatorAdapter } from '../utils/computerOperatorEngine';

function makeState(overrides: Partial<ScreenState> = {}): ScreenState {
  return {
    id: 'screen-1',
    elements: [],
    visibleErrors: [],
    dialogs: [],
    ambiguous: false,
    ...overrides,
  };
}

class FakeAdapter implements ScreenOperatorAdapter {
  readonly simulationOnly = true;
  clicks: number[] = [];
  state: ScreenState;
  failOn: 'act' | 'verify' | 'none';
  constructor(state: ScreenState, failOn: 'act' | 'verify' | 'none' = 'none') {
    this.state = state;
    this.failOn = failOn;
  }

  async observe(): Promise<ScreenState> {
    return this.state;
  }
  async act(action: OperatorAction): Promise<ActionResult> {
    if (this.failOn === 'act') {
      return { ok: false, message: 'SIMULATION_ONLY: failed act' };
    }
    if (action.type === 'click') {
      this.clicks.push(1);
    }
    return { ok: true, message: 'SIMULATION_ONLY: acted' };
  }
  async verify(after: ScreenState): Promise<VerificationResult> {
    if (this.failOn === 'verify') {
      return { ok: false, detail: 'SIMULATION_ONLY: verify failed' };
    }
    return { ok: !after.ambiguous, detail: 'SIMULATION_ONLY: verified' };
  }
}

const taskId = 'task-1';


describe('Computer Operator Engine + Screen Researcher', () => {
  it('classifies a desktop-control command as COMPUTER_OPERATION', () => {
    const bundle = classifyCommandIntent('JARVIS, VS Code kholo');
    assert.equal(bundle.intent, 'COMPUTER_OPERATION');
  });

  it('classifies a screen-investigation command as RESEARCH', () => {
    const bundle = classifyCommandIntent('screen dekhkar batao, error kya hai');
    assert.equal(bundle.intent, 'RESEARCH');
  });

  it('classifies an outgoing message command as DANGEROUS needing approval', () => {
    const bundle = classifyCommandIntent('WhatsApp pe Rahul ko message bhej do');
    assert.equal(bundle.intent, 'DANGEROUS_ACTION_REQUIRING_APPROVAL');
    assert.equal(bundle.needsApproval, true);
  });

  it('classifies a special command without needing approval', () => {
    const bundle = classifyCommandIntent('aaj ka weather batao');
    assert.equal(bundle.intent, 'SPECIAL_COMMAND');
    assert.equal(bundle.needsApproval, false);
  });

  it('classifies normal conversation as NORMAL_CONVERSATION', () => {
    const bundle = classifyCommandIntent('mera naam Rahul hai');
    assert.equal(bundle.intent, 'NORMAL_CONVERSATION');
  });

  it('recognises cancel phrases', () => {
    assert.equal(isCancelCommand('stop'), true);
    assert.equal(isCancelCommand('cancel'), true);
    assert.equal(isCancelCommand('continue'), false);
  });


  it('planner blocks on ambiguous screens without inventing steps', () => {
    const plan = planScreenActions('browser kholo', makeState({ ambiguous: true }), { read: true, control: true });
    assert.equal(plan.blockedBy, 'AMBIGUOUS_SCREEN_STOP');
    assert.equal(plan.actions.length, 0);
  });

  it('planner requires screen-read permission', () => {
    const plan = planScreenActions('browser kholo', makeState(), { read: false, control: true });
    assert.equal(plan.blockedBy, 'SCREEN_READ_PERMISSION_REQUIRED');
  });


  it('plans a read capture for error screens', () => {
    const plan = planScreenActions('error theek karo', makeState({ visibleErrors: ['APP_CRASH'] }), { read: true, control: true });
    assert.ok(plan.actions.some((a) => a.type === 'read'));
    assert.ok(plan.actions.some((a) => a.type === 'screenshot'));
  });


  it('unsafe click requires approval when control is not granted', () => {
    const plan = planScreenActions(
      'browser kholo',
      makeState({ elements: [{ id: 'e1', type: 'icon', x: 0, y: 0, text: 'Chrome' } as any ] }),
      { read: true, control: false },
    );
    assert.equal(plan.needsApproval, true);
  });


  it('runs a happy-path task to COMPLETED with simulation-only marking', async () => {
    const adapter = new FakeAdapter(makeState());
    const plan = planScreenActions('screen inspect karo', makeState(), { read: true, control: true });
    const result = await executeOperatorTask(adapter, 'inspect screen', plan, {
      taskId,
      killSwitchActive: false,
    });
    assert.equal(result.ok, true);
    assert.equal(adapter.clicks, 0);
    assert.equal(result.task.status, 'COMPLETED');
  });


  it('blocks all operator work when the Global Kill Switch is active', async () => {
    const adapter = new FakeAdapter(makeState());
    const plan = planScreenActions('browser kholo', makeState(), { read: true, control: true });
    const result = await executeOperatorTask(adapter, 'browser kholo', plan, {
      taskId: taskId + '-kill',
      killSwitchActive: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.task.status, 'BLOCKED');
    assert.equal(result.task.error, 'GLOBAL_KILL_SWITCH_ACTIVE');
    assert.equal(adapter.clicks, 0);
  });


  it('requires explicit approval before executing unsafe plans', async () => {
    const adapter = new FakeAdapter(makeState());
    const plan = planScreenActions('browser kholo', makeState(), { read: true, control: false });
const result = await executeOperatorTask(adapter, 'browser kholo', plan, {
      taskId: taskId + '-approval',
      killSwitchActive: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.task.status, 'NEEDS_APPROVAL');
    assert.equal(result.task.approvalState, 'PENDING');
  });


  it('cancels a running task via cancel token', async () => {
    const adapter = new FakeAdapter(makeState());
    const plan = planScreenActions('click karo', makeState(), { read: true, control: true });
    let cancelled = false;
    const result = await executeOperatorTask(adapter, 'click karo', plan, {
      taskId: taskId + '-cancel',
      killSwitchActive: false,
      cancelCheck: () => {
        cancelled = true;
        return true;
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.task.status, 'CANCELLED');
    assert.equal(cancelled, true);
  });


  it('marks a failed action honestly', async () => {
    const adapter = new FakeAdapter(makeState(), 'act');
    const plan = planScreenActions('browser kholo', makeState(), { read: true, control: true });
const result = await executeOperatorTask(adapter, 'browser kholo', plan, {
      taskId: taskId + '-fail',
      killSwitchActive: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.task.status, 'FAILED');
    assert.ok(result.task.error?.includes('ACTION_FAILED'));
  });


  it('marks verification failure honestly', async () => {
    const adapter = new FakeAdapter(makeState({ ambiguous: true }), 'verify');
    const plan = planScreenActions('browser kholo', makeState(), { read: true, control: true });
const result = await executeOperatorTask(adapter, 'browser kholo', plan, {
      taskId: taskId + '-verifyfail',
      killSwitchActive: false,
    });
    assert.equal(result.ok, false);
    assert.equal(result.task.status, 'FAILED');
    assert.ok(result.task.error?.includes('VERIFICATION_FAILED'));
  });


  it('redacts passwords and API tokens from streams', () => {
    const redacted = redactSecrets('api_key=sk-1234567890abcdef password=hunter2');
    assert.ok(!redacted.includes('hunter2'));
    assert.ok(!redacted.includes('sk-1234567890abcdef'));
    assert.ok(redacted.includes('[REDACTED]'));
  });


  it('redacts bearer JWT-like secrets', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const redacted = redactSecrets('token' + ' ' + jwt);
    assert.ok(!redacted.includes('eyJhbGci'));
    assert.ok(redacted.includes('[REDACTED]'));
  });


  it('not-configured adapter never fakes desktop access', async () => {
    const adapter = new NotConfiguredScreenOperator() as ScreenOperatorAdapter;
    const state = await adapter.observe();
    assert.ok(state.visibleErrors.includes('DESKTOP_CONTROL_NOT_CONFIGURED'));
    const acted = await adapter.act({ type: 'click', safe: false, description: 'x' });
    assert.equal(acted.ok, false);
  });


  it('simulated adapter marks every result simulation-only', async () => {
    const adapter = new SimulatedScreenAdapter(makeState());
    const before = await adapter.observe();
    const acted = await adapter.act({ type: 'click', targetId: 'e1', safe: false, description: 'x' });
    assert.ok(acted.message.includes('SIMULATION_ONLY'));
    assert.equal(before.id, 'screen-1');
  });


  it('intent detection does not auto-approve dangerous output', () => {
    const dangerous = detectDangerousIntent('youtube pe video upload karo');
    assert.equal(dangerous.dangerous, true);
  });
});