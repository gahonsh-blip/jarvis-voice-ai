import { describe, it, expect } from 'vitest';
import { AutonomousGoalRunner, type GoalStep } from '../utils/autonomous/goalRunner';
import { buildReceipt, makeEvidence } from '../utils/executionTruth';

const step = (over: Partial<GoalStep> & { id: string }): GoalStep => ({
  description: `step ${over.id}`,
  execute: async () => 'ok',
  verify: () => true,
  ...over,
});

describe('AutonomousGoalRunner', () => {
  it('verifies a run only when every step verifies', async () => {
    const runner = new AutonomousGoalRunner();
    const result = await runner.run('do two things', [
      step({ id: 'a', verify: () => true }),
      step({ id: 'b', verify: () => true }),
    ]);

    expect(result.outcome).toBe('VERIFIED');
    expect(result.verified).toBe(true);
    expect(result.steps.every((s) => s.status === 'DONE')).toBe(true);
    expect(result.receipt.evidence).not.toBeNull();
  });

  it('fails the run when a step fails, and stops later steps', async () => {
    const runner = new AutonomousGoalRunner();
    let laterRan = false;
    const result = await runner.run('fail midway', [
      step({ id: 'a', verify: () => false }),
      step({
        id: 'b',
        execute: async () => {
          laterRan = true;
          return 'ok';
        },
      }),
    ]);

    expect(result.outcome).toBe('FAILED');
    expect(result.verified).toBe(false);
    expect(laterRan).toBe(false);
    expect(result.steps.find((s) => s.id === 'b')?.status).toBe('PENDING');
  });

  it('never marks a step done when no verifier is defined', async () => {
    const runner = new AutonomousGoalRunner();
    const result = await runner.run('unverified', [
      step({ id: 'a', verify: undefined }),
    ]);

    expect(result.outcome).toBe('FAILED');
    expect(result.steps[0].detail).toContain('cannot be confirmed');
  });

  it('refuses to treat a simulated step as success', async () => {
    const runner = new AutonomousGoalRunner();
    const result = await runner.run('simulate', [
      step({
        id: 'a',
        verify: () =>
          buildReceipt({
            action: 'test',
            target: 'x',
            outcome: 'SIMULATION_ONLY',
            detailEn: 'only simulated',
            detailHi: 'केवल सिमुलेशन',
          }),
      }),
    ]);

    expect(result.outcome).toBe('FAILED');
    expect(result.steps[0].status).toBe('FAILED');
  });

  it('upgrades a step only when the receipt is VERIFIED with evidence', async () => {
    const runner = new AutonomousGoalRunner();
    const result = await runner.run('evidence', [
      step({
        id: 'a',
        verify: () =>
          buildReceipt({
            action: 'test',
            target: 'x',
            outcome: 'VERIFIED',
            detailEn: 'confirmed',
            detailHi: 'पुष्टि',
            evidence: makeEvidence('local_file', '/tmp/x'),
          }),
      }),
    ]);

    expect(result.outcome).toBe('VERIFIED');
  });

  it('pauses for approval and never assumes consent when no channel exists', async () => {
    const runner = new AutonomousGoalRunner();
    let executed = false;
    const result = await runner.run('needs approval', [
      step({
        id: 'a',
        requiresApproval: true,
        execute: async () => {
          executed = true;
          return 'ok';
        },
      }),
    ]);

    expect(executed).toBe(false);
    expect(result.awaitingApproval).toBe(true);
    expect(result.outcome).toBe('DISPATCHED');
    expect(result.steps[0].status).toBe('AWAITING_APPROVAL');
  });

  it('runs an approved step and skips a rejected one', async () => {
    const runner = new AutonomousGoalRunner({
      approve: async (s) => s.id === 'yes',
    });
    const result = await runner.run('approvals', [
      step({ id: 'yes', requiresApproval: true }),
      step({ id: 'no', requiresApproval: true }),
    ]);

    expect(result.steps.find((s) => s.id === 'yes')?.status).toBe('DONE');
    expect(result.steps.find((s) => s.id === 'no')?.status).toBe('SKIPPED');
  });

  it('retries only steps marked retryable, up to maxAttempts', async () => {
    const runner = new AutonomousGoalRunner();
    let attempts = 0;
    const result = await runner.run('retry', [
      step({
        id: 'flaky',
        retryable: true,
        maxAttempts: 3,
        execute: async () => {
          attempts += 1;
          return attempts;
        },
        verify: () => attempts >= 2,
      }),
    ]);

    expect(attempts).toBe(2);
    expect(result.outcome).toBe('VERIFIED');
  });

  it('does not retry a step that is not marked retryable', async () => {
    const runner = new AutonomousGoalRunner();
    let attempts = 0;
    const result = await runner.run('no retry', [
      step({
        id: 'once',
        execute: async () => {
          attempts += 1;
          return 'x';
        },
        verify: () => false,
      }),
    ]);

    expect(attempts).toBe(1);
    expect(result.outcome).toBe('FAILED');
  });

  it('records a complete audit trail of every transition', async () => {
    const runner = new AutonomousGoalRunner({ approve: () => true });
    const result = await runner.run('audited', [
      step({ id: 'a', requiresApproval: true }),
      step({ id: 'b' }),
    ]);

    const events = result.audit.map((e) => e.event);
    expect(events).toContain('APPROVAL_REQUESTED');
    expect(events).toContain('APPROVAL_DECIDED');
    expect(events).toContain('STEP_STARTED');
    expect(events).toContain('STEP_SUCCEEDED');
    expect(events[events.length - 1]).toBe('RUN_FINISHED');
  });

  it('captures a thrown error as a failure rather than a crash', async () => {
    const runner = new AutonomousGoalRunner();
    const result = await runner.run('throws', [
      step({
        id: 'boom',
        execute: async () => {
          throw new Error('kaboom');
        },
      }),
    ]);

    expect(result.outcome).toBe('FAILED');
    expect(result.steps[0].detail).toContain('kaboom');
  });
});