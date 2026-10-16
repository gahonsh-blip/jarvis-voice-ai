import { describe, it, expect } from 'vitest';
import { TelephonySessionManager } from '../utils/telephonySessionManager';
import { DEFAULT_CLINIC_CONFIG } from '../utils/telephonyPermissions';

// Zero-fake-success guard for the telephony clinic-facts intents.
//
// processTurn used to recite the clinic operating hours, the named doctor's
// availability and the booking process as fact on every live call, reading them
// from DEFAULT_CLINIC_CONFIG — a hardcoded sample dataset that no human had
// verified for the deployment. On a real inbound call that presents unverified
// sample data ("Apollo Health & Wellness Clinic", "Dr. Julian Wayne") as the
// clinic's own details.
//
// These tests pin the honest behaviour: an unconfigured clinic reports the fact
// as unverified, and a genuinely configured clinic still answers normally.

function turnWith(utterance: string, clinicData?: typeof DEFAULT_CLINIC_CONFIG) {
  const session = TelephonySessionManager.createInboundSession({
    rawCallerNumber: '+91 98765 00000',
    isSimulated: true,
  });
  return TelephonySessionManager.processTurn({
    callSessionId: session.callSessionId,
    utterance,
    clinicData,
  });
}

describe('telephony clinic facts are not recited when unverified', () => {
  it('ships an unconfigured sample clinic config', () => {
    expect(DEFAULT_CLINIC_CONFIG.configured).toBe(false);
  });

  it('does not recite opening hours for an unverified clinic', async () => {
    const turn = await turnWith('what are your clinic hours on weekdays?');
    expect(turn.intent).toBe('clinic_hours');
    expect(turn.replyText).not.toContain('9:00');
    expect(turn.replyText).not.toContain('Monday');
    expect(turn.replyText.toLowerCase()).toContain('not verified');
  });

  it('does not recite opening hours in Hindi for an unverified clinic', async () => {
    const turn = await turnWith('नमस्ते, आज क्लिनिक कितने बजे खुलेगा?');
    expect(turn.intent).toBe('clinic_hours');
    expect(turn.replyText).not.toContain('9:00');
    expect(turn.replyText).toContain('सत्यापित नहीं');
  });

  it('does not recite the booking process for an unverified clinic', async () => {
    const turn = await turnWith('how do I get an appointment?');
    expect(turn.intent).toBe('appointment_process');
    expect(turn.replyText.toLowerCase()).toContain('not verified');
    expect(turn.replyText.toLowerCase()).not.toContain('sms confirmation');
  });

  it('does not assert the named doctor is available for an unverified clinic', async () => {
    const turn = await turnWith('is the doctor available in clinic today?');
    expect(turn.intent).toBe('doctor_availability');
    expect(turn.replyText).not.toContain('Julian Wayne');
    expect(turn.replyText.toLowerCase()).toContain('not verified');
  });

  it('still answers normally when the deployment supplies verified clinic data', async () => {
    const verified = { ...DEFAULT_CLINIC_CONFIG, configured: true };

    const hours = await turnWith('what are your clinic hours on weekdays?', verified);
    expect(hours.intent).toBe('clinic_hours');
    expect(hours.replyText).toContain('9:00 AM to 6:00 PM');

    const appt = await turnWith('how do I get an appointment?', verified);
    expect(appt.intent).toBe('appointment_process');
    expect(appt.replyText.toLowerCase()).toContain('sms confirmation');

    const avail = await turnWith('is the doctor available in clinic today?', verified);
    expect(avail.intent).toBe('doctor_availability');
    expect(avail.replyText).toContain('Julian Wayne');
  });
});
