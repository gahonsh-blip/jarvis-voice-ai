import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACTION_ITEM_LIST_NOTE,
  ACTION_ITEM_NOT_PERFORMED_NOTE,
  describeInboundCall,
  describeOutboundCall,
  formatActionItem,
} from '../utils/hardening/callSummaryTruth';
import { summarizeCallTranscript } from '../utils/telephonyEngine';
import type { CallTurn } from '../types/telephony';

// item 13 — the call-summary surface. `summarizeCallTranscript()` regex-matched
// the transcript and then reported its follow-ups as completed work ("Added
// caller to spam blocklist", "Calendar appointment updated") and its summary as
// achieved ("Successfully conveyed objectives ... synced action items"), none of
// which anything in that path did.

const turn = (id: string, speaker: CallTurn['speaker'], text: string): CallTurn => ({
  id,
  speaker,
  text,
  timestamp: '10:00:00 AM',
});

describe('formatActionItem presents a recorded follow-up as outstanding work', () => {
  it('appends the not-performed marker to a task', () => {
    expect(formatActionItem('Add caller to spam blocklist')).toBe(
      `Add caller to spam blocklist — ${ACTION_ITEM_NOT_PERFORMED_NOTE}`
    );
  });

  it('is idempotent for an already-marked item', () => {
    const once = formatActionItem('Update calendar');
    expect(formatActionItem(once)).toBe(once);
  });

  it('states the absence of a task rather than inventing one', () => {
    expect(formatActionItem('   ')).toContain(ACTION_ITEM_NOT_PERFORMED_NOTE);
  });

  it('never reports an action item as completed or dispatched', () => {
    const rendered = formatActionItem('Calendar appointment updated');
    expect(rendered).not.toMatch(/completed successfully/i);
    expect(rendered).not.toMatch(/dispatched/i);
    expect(rendered).toContain(ACTION_ITEM_NOT_PERFORMED_NOTE);
  });
});

describe('summarizeCallTranscript reports only what the transcript supports', () => {
  it('marks every returned action item as not performed', () => {
    const result = summarizeCallTranscript(
      [turn('1', 'caller', 'Can we reschedule the Friday appointment?')],
      'outbound',
      'Dr. Wayne'
    );
    expect(result.followUpActions.length).toBeGreaterThan(0);
    for (const item of result.followUpActions) {
      expect(item).toContain(ACTION_ITEM_NOT_PERFORMED_NOTE);
    }
  });

  it('does not claim objectives were conveyed or action items synced', () => {
    const { summary } = summarizeCallTranscript(
      [turn('1', 'agent', 'Hello, this is JARVIS.')],
      'outbound',
      'Dr. Wayne'
    );
    expect(summary).not.toMatch(/successfully conveyed/i);
    expect(summary).not.toMatch(/synced action items/i);
    expect(summary).not.toMatch(/confirmed schedule/i);
  });

  it('still reports the negative sentiment for a spam transcript', () => {
    const result = summarizeCallTranscript(
      [turn('1', 'caller', 'You are pre-selected for solar panels')],
      'inbound',
      'Unknown'
    );
    expect(result.sentiment).toBe('negative');
  });
});

describe('describeOutboundCall / describeInboundCall never claim completion', () => {
  it('outbound summary names the counterparty and disclaims performed follow-ups', () => {
    const summary = describeOutboundCall('Dr. Wayne');
    expect(summary).toContain('Dr. Wayne');
    expect(summary).not.toMatch(/successfully|synced action items/i);
  });

  it('inbound summary names the counterparty and disclaims performed follow-ups', () => {
    const summary = describeInboundCall('Elena Rostova');
    expect(summary).toContain('Elena Rostova');
    expect(summary).not.toMatch(/successfully|confirmed schedule/i);
  });
});

describe('the action-item list note forbids reading the list as a ledger', () => {
  it('states the items are recorded and not yet performed', () => {
    expect(ACTION_ITEM_LIST_NOTE).toMatch(/not yet performed/i);
    expect(ACTION_ITEM_LIST_NOTE).not.toMatch(/assigned|dispatched/i);
  });
});

describe('telephonyEngine source no longer states performed follow-ups', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../utils/telephonyEngine.ts'),
    'utf8'
  );

  it('removed the fabricated completion strings', () => {
    expect(src).not.toContain('Added caller to spam blocklist');
    expect(src).not.toContain('Calendar appointment updated');
    expect(src).not.toContain('Successfully conveyed objectives');
  });
});
