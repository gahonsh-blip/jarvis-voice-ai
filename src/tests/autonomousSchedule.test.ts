import { describe, it, expect } from 'vitest';
import {
  isGoalDue,
  nextScheduledOccurrence,
  dueGoals,
  type ScheduledGoal,
  type ScheduleClock,
} from '../utils/autonomous/schedule';

const goal = (over: Partial<ScheduledGoal> = {}): ScheduledGoal => ({
  id: 'g1',
  name: 'Daily tidy',
  atMinuteOfDay: 9 * 60, // 09:00
  steps: [{ kind: 'fs.mkdir', path: '/tmp/x' }],
  enabled: true,
  ...over,
});

const at = (h: number, m: number): ScheduleClock => ({
  minuteOfDay: h * 60 + m,
  date: '2026-09-19',
});

describe('isGoalDue', () => {
  it('is due inside the window', () => {
    expect(isGoalDue(goal(), undefined, at(9, 5))).toBe(true);
  });

  it('is not due before the window opens', () => {
    expect(isGoalDue(goal(), undefined, at(8, 59))).toBe(false);
  });

  it('is not due after the window closes', () => {
    expect(isGoalDue(goal(), undefined, at(9, 30))).toBe(false);
  });

  it('is not due when it already ran today', () => {
    expect(isGoalDue(goal(), at(9, 5).date, at(9, 6))).toBe(false);
  });

  it('is not due when disabled', () => {
    expect(isGoalDue(goal({ enabled: false }), undefined, at(9, 5))).toBe(false);
  });
});

describe('nextScheduledOccurrence', () => {
  it('points at today when the time has not arrived', () => {
    const { nextRunAt, missedRun } = nextScheduledOccurrence(goal(), undefined, at(7, 0));
    expect(nextRunAt).toContain('09:00');
    expect(nextRunAt).not.toContain('+1d');
    expect(missedRun).toBe(false);
  });

  it('flags a missed run when the window passed with no record', () => {
    const { missedRun } = nextScheduledOccurrence(goal(), undefined, at(11, 0));
    expect(missedRun).toBe(true);
  });

  it('does not flag a missed run when it already ran today', () => {
    const { missedRun } = nextScheduledOccurrence(goal(), at(11, 0).date, at(11, 0));
    expect(missedRun).toBe(false);
  });
});

describe('dueGoals', () => {
  it('returns only the goals whose window is open', () => {
    const goals = [goal({ id: 'a', atMinuteOfDay: 9 * 60 }), goal({ id: 'b', atMinuteOfDay: 12 * 60 })];
    const due = dueGoals(goals, {}, at(9, 3));
    expect(due.map((g) => g.id)).toEqual(['a']);
  });

  it('skips goals that already ran today', () => {
    const due = dueGoals([goal({ id: 'a', atMinuteOfDay: 9 * 60 })], { a: at(9, 3).date }, at(9, 3));
    expect(due).toEqual([]);
  });
});