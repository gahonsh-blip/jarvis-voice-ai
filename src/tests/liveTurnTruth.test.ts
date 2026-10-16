import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { normalizeLiveTurn } from '../utils/hardening/liveTurnTruth';
import { processTelephonyTurn } from '../utils/telephonyEngine';

// Zero-fake-success guard for the live call-turn path.
//
// `POST /api/telephony/handle-turn` answers `{ success, turn: {...}, source }`.
// The client read `replyText`/`whisperTip` straight off the top level, so both
// were `undefined` against the live server while the route still reported
// `success: true`: the transcript gained an empty spoken turn and the whisper
// tip was silently dropped. The request body also used the engine's own field
// names, so the route answered a generic line for every turn.

const LIVE_ENVELOPE = {
  success: true,
  turn: {
    replyText: 'Thursday at 2:30 PM is noted and accepted on our end.',
    whisperTip: 'Suggestion: confirm the Thursday 2:30 PM slot. — AI suggestion — not an observed system event',
    sentiment: 'positive',
    intent: 'telephony_conversation',
    shouldEndCall: true,
    followUpActions: ['Calendar updated: Thursday 2:30 PM — recorded live — not confirmed as performed'],
  },
  source: 'autonomous_local_telephony_engine',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('normalizeLiveTurn lifts the turn out of the server envelope', () => {
  it('reads the nested turn rather than the top level', () => {
    const turn = normalizeLiveTurn(LIVE_ENVELOPE);
    expect(turn.replyText).toBe('Thursday at 2:30 PM is noted and accepted on our end.');
    expect(turn.whisperTip).toBe(
      'Suggestion: confirm the Thursday 2:30 PM slot. — AI suggestion — not an observed system event'
    );
    expect(turn.sentiment).toBe('positive');
    expect(turn.intent).toBe('telephony_conversation');
    expect(turn.shouldEndCall).toBe(true);
    expect(turn.followUpActions).toHaveLength(1);
  });

  it('reports an absent reply as empty rather than inventing a line', () => {
    const turn = normalizeLiveTurn({ success: true, turn: {}, source: 'x' });
    expect(turn.replyText).toBe('');
    expect(turn.whisperTip).toBeUndefined();
    expect(turn.sentiment).toBe('neutral');
    expect(turn.intent).toBe('conversation');
    expect(turn.shouldEndCall).toBe(false);
    expect(turn.followUpActions).toEqual([]);
  });

  it('still accepts the flat legacy body as a fallback', () => {
    const turn = normalizeLiveTurn({ replyText: 'Hello.', sentiment: 'negative' });
    expect(turn.replyText).toBe('Hello.');
    expect(turn.sentiment).toBe('negative');
  });

  it('never returns a non-string replyText', () => {
    const turn = normalizeLiveTurn({ turn: { replyText: 42 } } as any);
    expect(turn.replyText).toBe('');
  });
});

describe('processTelephonyTurn uses the server reply instead of an empty turn', () => {
  it('returns the server reply and whisper tip', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => LIVE_ENVELOPE }))
    );

    const result = await processTelephonyTurn({
      callId: 'call-1',
      direction: 'inbound',
      callerName: 'Sarah',
      recipientName: 'Alex',
      objective: 'Confirm appointment',
      dialogueHistory: [{ id: '1', speaker: 'caller', text: 'Confirm Friday', timestamp: '00:01' }],
      latestInput: 'I want to confirm the appointment',
      speaker: 'caller',
    });

    expect(result.replyText).toBe('Thursday at 2:30 PM is noted and accepted on our end.');
    expect(result.whisperTip).toContain('AI suggestion — not an observed system event');
    expect(result.shouldEndCall).toBe(true);
    expect(result.followUpActions).toHaveLength(1);
  });

  it('sends the field names the server destructures', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => LIVE_ENVELOPE }));
    vi.stubGlobal('fetch', fetchMock);

    await processTelephonyTurn({
      callId: 'call-2',
      direction: 'outbound',
      callerName: 'Alex',
      recipientName: 'Elena Rostova',
      objective: 'Book a meeting',
      dialogueHistory: [],
      latestInput: 'Yes, 4pm works',
      speaker: 'callee',
    });

    const call = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(call[1].body);
    expect(body.userUtterance).toBe('Yes, 4pm works');
    expect(body.isOutbound).toBe(true);
    expect(body.callerPersona.name).toBe('Elena Rostova');
    expect(body.callObjective).toBe('Book a meeting');
    expect(body).not.toHaveProperty('latestInput');
  });
});

describe('telephonyEngine reads the envelope it is sent', () => {
  const engineSource = fs.readFileSync(path.join(process.cwd(), 'src/utils/telephonyEngine.ts'), 'utf-8');

  it('normalizes the handle-turn response', () => {
    expect(engineSource).toContain('normalizeLiveTurn(data)');
  });

  it('sends the server request field names', () => {
    expect(engineSource).toContain('userUtterance: params.latestInput');
    expect(engineSource).toContain("isOutbound: params.direction === 'outbound'");
  });
});
