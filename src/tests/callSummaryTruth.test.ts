import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  ACTION_ITEM_LIST_NOTE,
  ACTION_ITEM_NOT_PERFORMED_NOTE,
  LIVE_ACTION_ITEM_NOTE,
  describeInboundCall,
  describeOutboundCall,
  formatActionItem,
  formatLiveActionItem,
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

  it('does not assert a positive call when it matched no keyword', () => {
    const result = summarizeCallTranscript(
      [turn('1', 'caller', 'Hi, just checking in about the weather today.')],
      'inbound',
      'Unknown'
    );
    expect(result.sentiment).toBe('neutral');
  });

  it('does not assert a positive call for a transcript with no sentiment signal', () => {
    const result = summarizeCallTranscript(
      [turn('1', 'caller', 'Hello?')],
      'outbound',
      'Dr. Wayne'
    );
    expect(result.sentiment).not.toBe('positive');
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

// item 13, continued — the server turn path. Slot 6 fixed the client-side
// summariser, but `POST /api/telephony/handle-turn` in server.ts still returns
// follow-ups phrased as completed work in both the Gemini branch (the model's
// own strings, surfaced verbatim) and the rule-based fallback ("Calendar
// updated: Thursday 2:30 PM", "Send confirmation SMS", "Add number to local
// blocklist"). Neither branch dispatches anything; the route only produces the
// reply text and the UI renders the list as the call's action items.

describe('formatLiveActionItem marks a live-captured follow-up as unperformed', () => {
  it('appends the live marker to a captured task', () => {
    expect(formatLiveActionItem('Calendar updated: Thursday 2:30 PM')).toBe(
      `Calendar updated: Thursday 2:30 PM — ${LIVE_ACTION_ITEM_NOTE}`
    );
  });

  it('is idempotent for an already-marked item', () => {
    const once = formatLiveActionItem('Send confirmation SMS');
    expect(formatLiveActionItem(once)).toBe(once);
  });

  it('states the absence of a task rather than inventing one', () => {
    expect(formatLiveActionItem('')).toContain(LIVE_ACTION_ITEM_NOTE);
  });

  it('keeps the distinct live marker so a live item is not confused with a summary item', () => {
    expect(LIVE_ACTION_ITEM_NOTE).not.toBe(ACTION_ITEM_NOT_PERFORMED_NOTE);
  });
});

describe('server handle-turn marks every returned follow-up as unperformed', () => {
  const serverSource = fs.readFileSync(
    path.resolve(__dirname, '../../server.ts'),
    'utf8'
  );

  it('imports the live formatter from the shared truth helper', () => {
    expect(serverSource).toContain(
      "import { formatLiveActionItem } from './src/utils/hardening/callSummaryTruth'"
    );
  });

  it('wraps the Gemini branch follow-ups instead of returning them verbatim', () => {
    expect(serverSource).toContain(
      'parsed.followUpActions.map((a: any) => formatLiveActionItem(String(a)))'
    );
  });

  it('wraps the rule-based fallback follow-ups before returning them', () => {
    expect(serverSource).toContain('followUpActions.map(formatLiveActionItem)');
  });

  it('does not return the raw fallback array as the turn result', () => {
    // The literal `followUpActions,` shorthand in the fallback response is what
    // this slot replaced; its absence proves the map() runs on that path.
    expect(serverSource).not.toMatch(/shouldEndCall,\s*followUpActions,\s*\}/);
  });
});
