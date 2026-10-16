import { describe, it, expect, beforeEach } from 'vitest';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import type { MemoryStore } from '../types';

// Regression guard for the offline Local JARVIS Engine informational branches.
// The YouTube status, system-diagnostic, capabilities, clinic-hours and
// appointment-process intents only produce a sentence: they read no provider,
// open no view and create no booking. Each nonetheless reported
// `actionExecuted: true` and advanced the user-visible "Autonomous Actions
// Executed" counter, so a question was recorded as performed work. The caller
// (`handleExecuteAction` in `src/App.tsx`) has no case for any of these intents,
// so no side effect was ever possible.
//
// These tests pin `actionExecuted: false` and a counter that does not move, and
// prove the change is scoped by checking a genuine page-local action still
// counts.

describe('offline engine informational intents do not count as executed actions', () => {
  let memory: MemoryStore;

  beforeEach(() => {
    memory = {
      name: '',
      notes: [],
      customKeyValues: {},
      stats: {
        totalCommands: 0,
        actionsExecuted: 0,
        lastActive: '2026-09-01T00:00:00.000Z',
      },
    };
  });

  const informational: Array<{ label: string; command: string; intent: string }> = [
    { label: 'youtube_status_inquiry', command: 'youtube status', intent: 'youtube_status_inquiry' },
    { label: 'system_diagnostic', command: 'what is the current time and date', intent: 'system_diagnostic' },
    { label: 'capabilities_inquiry', command: 'what can you do', intent: 'capabilities_inquiry' },
    { label: 'clinic_hours', command: 'clinic hours', intent: 'clinic_hours' },
    { label: 'appointment_process', command: 'how to get an appointment', intent: 'appointment_process' },
  ];

  for (const { label, command, intent } of informational) {
    it(`${label} reports actionExecuted: false`, () => {
      const result = processOfflineCommand(command, memory, 'en-US');
      expect(result.intent).toBe(intent);
      expect(result.actionExecuted).toBe(false);
    });

    it(`${label} does not advance the Autonomous Actions Executed counter`, () => {
      const result = processOfflineCommand(command, memory, 'en-US');
      expect(result.updatedMemory?.stats.actionsExecuted).toBe(0);
    });
  }

  it('keeps the counter at zero across a run of informational commands', () => {
    let current = memory;
    for (const { command } of informational) {
      const result = processOfflineCommand(command, current, 'en-US');
      current = result.updatedMemory!;
    }
    expect(current.stats.actionsExecuted).toBe(0);
    expect(current.stats.totalCommands).toBe(informational.length);
  });

  it('does not narrate clinic hours or the appointment process as executed work', () => {
    const hours = processOfflineCommand('clinic hours', memory, 'en-US');
    expect(hours.actionDetail?.title).not.toMatch(/Telemetry/i);

    const appointment = processOfflineCommand('how to get an appointment', memory, 'en-US');
    expect(appointment.actionDetail?.title).not.toMatch(/Booking Process/i);
    expect(appointment.actionDetail?.title).toMatch(/no booking made/i);
  });

  it('still counts a genuine page-local action (setting the user name)', () => {
    const result = processOfflineCommand('My name is Tony Stark', memory, 'en-US');
    expect(result.intent).toBe('set_name');
    expect(result.actionExecuted).toBe(true);
    expect(result.updatedMemory?.stats.actionsExecuted).toBe(1);
  });
});
