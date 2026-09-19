import { describe, it, expect } from 'vitest';
import {
  VoiceSession,
  interpretConfirmation,
  requiresVoiceConfirmation,
} from '../utils/voice/voiceSession';

describe('interpretConfirmation', () => {
  it('accepts clear affirmatives', () => {
    for (const phrase of ['yes', 'yeah', 'ok', 'do it', 'go ahead', 'haan', 'theek hai', 'हाँ']) {
      expect(interpretConfirmation(phrase)).toBe('CONFIRMED');
    }
  });

  it('accepts clear negatives', () => {
    for (const phrase of ['no', 'cancel', 'stop', 'nahi', 'नहीं']) {
      expect(interpretConfirmation(phrase)).toBe('DECLINED');
    }
  });

  it('treats an empty reply as unclear, never as yes', () => {
    expect(interpretConfirmation('')).toBe('UNCLEAR');
  });

  it('treats a mixed yes-and-no reply as unclear', () => {
    expect(interpretConfirmation('yes no wait')).toBe('UNCLEAR');
  });

  it('treats unrelated speech as unclear', () => {
    expect(interpretConfirmation('what time is it')).toBe('UNCLEAR');
  });
});

describe('requiresVoiceConfirmation', () => {
  it('requires confirmation for destructive actions', () => {
    expect(requiresVoiceConfirmation('delete all my notes')).toBe(true);
    expect(requiresVoiceConfirmation('shutdown the computer')).toBe(true);
  });

  it('requires confirmation for external actions', () => {
    expect(requiresVoiceConfirmation('send a message to Rahul')).toBe(true);
    expect(requiresVoiceConfirmation('post this on LinkedIn')).toBe(true);
    expect(requiresVoiceConfirmation('push the branch')).toBe(true);
  });

  it('requires confirmation for Hindi destructive verbs', () => {
    expect(requiresVoiceConfirmation('सभी नोट्स मिटा दो')).toBe(true);
  });

  it('does not require confirmation for read-only questions', () => {
    expect(requiresVoiceConfirmation('what is the battery level')).toBe(false);
    expect(requiresVoiceConfirmation('take a screenshot')).toBe(false);
  });
});

describe('VoiceSession lifecycle', () => {
  it('starts idle', () => {
    const session = new VoiceSession();
    expect(session.snapshot.state).toBe('IDLE');
  });

  it('opens a listening window on a wake word', () => {
    const session = new VoiceSession();
    session.awaitWakeWord();
    expect(session.wakeDetected().state).toBe('LISTENING');
  });

  it('executes a safe command without confirmation', () => {
    const session = new VoiceSession();
    session.wakeDetected();
    const result = session.commandHeard('take a screenshot');
    expect(result.action).toBe('EXECUTE');
    expect(session.snapshot.state).toBe('PROCESSING');
  });

  it('holds a sensitive command for confirmation and does not execute it yet', () => {
    const session = new VoiceSession();
    session.wakeDetected();
    const result = session.commandHeard('delete all my files');

    expect(result.action).toBe('CONFIRM');
    expect(session.snapshot.state).toBe('CONFIRMING');
    expect(session.snapshot.pendingCommand).toBe('delete all my files');
  });

  it('only runs the held command after a clear yes', () => {
    const session = new VoiceSession();
    session.wakeDetected();
    session.commandHeard('send the message');

    const unclear = session.confirmationHeard('maybe later');
    expect(unclear.verdict).toBe('UNCLEAR');
    expect(unclear.command).toBeNull();

    const confirmed = session.confirmationHeard('yes do it');
    expect(confirmed.verdict).toBe('CONFIRMED');
    expect(confirmed.command).toBe('send the message');
  });

  it('drops the command on a no', () => {
    const session = new VoiceSession();
    session.wakeDetected();
    session.commandHeard('delete my notes');

    const result = session.confirmationHeard('no cancel that');
    expect(result.verdict).toBe('DECLINED');
    expect(result.command).toBeNull();
    expect(session.snapshot.pendingCommand).toBeNull();
  });

  it('does not execute when confirmation times out', () => {
    const session = new VoiceSession();
    session.wakeDetected();
    session.commandHeard('delete my notes');

    session.confirmationTimedOut();
    expect(session.snapshot.pendingCommand).toBeNull();
    expect(session.snapshot.state).toBe('LISTENING');
  });

  it('ignores an empty command', () => {
    const session = new VoiceSession();
    session.wakeDetected();
    expect(session.commandHeard('   ').action).toBe('CONFIRM');
    expect(session.snapshot.pendingCommand).toBeNull();
  });

  it('does not confirm anything when no command is pending', () => {
    const session = new VoiceSession();
    session.awaitWakeWord();
    const result = session.confirmationHeard('yes');
    expect(result.command).toBeNull();
  });

  it('returns to awaiting a wake word when the listening window closes', () => {
    const session = new VoiceSession();
    session.wakeDetected();
    expect(session.commandWindowElapsed().state).toBe('AWAITING_WAKE');
  });

  it('clears everything on reset', () => {
    const session = new VoiceSession();
    session.wakeDetected();
    session.commandHeard('delete everything');
    const snap = session.reset();
    expect(snap.state).toBe('IDLE');
    expect(snap.pendingCommand).toBeNull();
  });

  it('exposes configureable windows', () => {
    const session = new VoiceSession({ commandWindowMs: 3000, confirmWindowMs: 1500 });
    expect(session.commandWindowMs).toBe(3000);
    expect(session.confirmWindowMs).toBe(1500);
  });
});