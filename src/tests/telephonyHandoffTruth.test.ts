import { describe, it, expect, afterEach } from 'vitest';
import { TelephonySessionManager } from '../utils/telephonySessionManager';
import { TelephonyProviderRegistry } from '../utils/telephonyAdapters';

// Zero-fake-success guard for the telephony human-handoff (transfer) path.
//
// processTurn used to confirm a staff transfer whenever
// `provider.isConfigured() || session.isSimulated` and the adapter returned
// `providerConfirmed: true`. The simulator's transferCall() is hardcoded
// `providerConfirmed: true`, and a real carrier with no credentials configured
// cannot be observed at all — so a call that no carrier ever handled was
// reported to the caller as "Transferring your call to our clinic staff now,
// please hold the line." and the session advanced to CONFIRMED. These tests pin
// the honest behaviour: only a live gateway may confirm a handoff.

function handoffTurn(utterance: string, isSimulated: boolean) {
  const session = TelephonySessionManager.createInboundSession({
    rawCallerNumber: '+91 98765 00000',
    isSimulated,
  });
  return TelephonySessionManager.processTurn({
    callSessionId: session.callSessionId,
    utterance,
  });
}

afterEach(() => {
  // Leave the registry on its default carrier so other suites are unaffected.
  TelephonyProviderRegistry.setActiveProvider('twilio');
});

describe('telephony handoff never confirms a transfer without a live carrier', () => {
  it('reports a simulated session as unconfirmed instead of transferring', async () => {
    const turn = await handoffTurn('transfer me to a doctor', true);
    expect(turn.intent).not.toBe('handoff_confirmed');
    expect(turn.handoffStatus).toBe('FAILED');
    expect(turn.replyText).not.toContain('please hold the line');
    expect(turn.replyText.toLowerCase()).toContain('could not be confirmed');
  });

  it('does not claim a busy line that was never observed', async () => {
    const turn = await handoffTurn('transfer to staff', true);
    expect(turn.replyText).not.toContain('occupied on another line');
    expect(turn.replyText).not.toContain('लाइन व्यस्त');
  });

  it('reports an unconfigured real carrier as unconfirmed', async () => {
    TelephonyProviderRegistry.setActiveProvider('twilio');
    const turn = await handoffTurn('speak with a human', false);
    expect(turn.intent).not.toBe('handoff_confirmed');
    expect(turn.handoffStatus).toBe('FAILED');
  });

  it('still offers message taking after an unconfirmed transfer', async () => {
    const turn = await handoffTurn('talk to a person', true);
    expect(turn.intent).toBe('handoff_unavailable_message_taking');
    expect(turn.replyText.toLowerCase()).toContain('leave a message');
    expect(turn.shouldEndCall).toBe(false);
  });
});
