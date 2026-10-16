import { describe, it, expect } from 'vitest';
import { TelephonySessionManager } from '../utils/telephonySessionManager';

// Zero-fake-success guard for the telephony weather intent.
//
// processTurn used to answer a weather question with no connected source by
// speaking an invented temperature band ("25 to 28 degrees Celsius") as if it
// were live conditions. On a real call that is a fabricated reading. These
// tests pin the honest behaviour: only a supplied reading is spoken, and the
// absence of one is reported as unavailable.

function newSession() {
  return TelephonySessionManager.createInboundSession({
    rawCallerNumber: '+91 98765 00000',
    isSimulated: true,
  });
}

describe('telephony weather intent never invents a reading', () => {
  it('reports no source instead of a fabricated temperature band (Hindi)', async () => {
    const session = newSession();
    const turn = await TelephonySessionManager.processTurn({
      callSessionId: session.callSessionId,
      utterance: 'क्या आज मौसम खराब है?',
    });

    expect(turn.intent).toBe('weather_query');
    expect(turn.replyText).not.toContain('25 से 28');
    expect(turn.replyText).not.toContain('25 to 28');
    expect(turn.replyText).toContain('उपलब्ध नहीं');
  });

  it('reports no source instead of a fabricated temperature band (English)', async () => {
    const session = newSession();
    const turn = await TelephonySessionManager.processTurn({
      callSessionId: session.callSessionId,
      utterance: 'what is the weather like today?',
    });

    expect(turn.intent).toBe('weather_query');
    expect(turn.replyText).not.toContain('25 to 28');
    expect(turn.replyText.toLowerCase()).toContain('no weather source');
  });

  it('treats an empty telemetry object as no reading', async () => {
    const session = newSession();
    const turn = await TelephonySessionManager.processTurn({
      callSessionId: session.callSessionId,
      utterance: 'weather update',
      weatherData: {},
    });

    expect(turn.intent).toBe('weather_query');
    expect(turn.replyText).not.toContain('26°C');
    expect(turn.replyText).not.toContain('25 to 28');
  });

  it('speaks the supplied reading when a real source is connected', async () => {
    const session = newSession();
    const turn = await TelephonySessionManager.processTurn({
      callSessionId: session.callSessionId,
      utterance: 'क्या आज मौसम खराब है?',
      weatherData: { temp: '27°C', condition: 'Partly Cloudy', city: 'Gurugram' },
    });

    expect(turn.intent).toBe('weather_query');
    expect(turn.replyText).toContain('27°C');
    expect(turn.replyText).toContain('Gurugram');
  });
});
