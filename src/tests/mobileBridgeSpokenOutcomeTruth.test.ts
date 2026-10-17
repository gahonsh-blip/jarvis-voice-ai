import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { AndroidBridgeManager } from '../utils/androidBridgeEngine';
import {
  mobileCallAnswerOutcome,
  mobileMessageReplyOutcome,
  MOBILE_CALL_ANSWER_DISPATCHED_LINE,
  MOBILE_REPLY_DISPATCHED_LINE,
  MOBILE_BRIDGE_REFUSED_FALLBACK,
} from '../utils/hardening/mobileBridgeSpokenOutcomeTruth';

// Regression guard for backlog item 13. The App-level Android approval
// callbacks (`src/App.tsx`) discarded the bridge engine's verdict and spoke a
// flat done line — "कॉल उठा ली गई है" / "संदेश ... सफलतापूर्वक भेज दिया गया है"
// — even when the engine refused (no device, missing permission, kill switch)
// or had only handed the work to the device (unconfirmed). They also cleared the
// pending-approval card on a refusal. The decision logic is exercised directly
// against a real AndroidBridgeManager, and the wiring is asserted against the
// component source.
const appSource = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');

const FULL_CAPS = {
  deviceId: 'pixel_truth',
  deviceName: 'Pixel Truth',
  model: 'Pixel Truth',
  osVersion: 'Android 14',
  bridgeVersion: 'HERMES-ANDROID-BRIDGE/2.4.0',
  canDetectCalls: true,
  canAnswerCalls: true,
  telecomRoleDialer: true,
  answerCallsPermission: true,
  canReadNotifications: true,
  canInlineReply: true,
  canOpenApp: true,
  canLookupContacts: true,
  isSimulation: false,
};

function handlerBody(name: string, nextMarker: string): string {
  const start = appSource.indexOf(`const ${name}`);
  return appSource.slice(start, appSource.indexOf(nextMarker, start));
}

describe('mobileCallAnswerOutcome reports the real engine verdict', () => {
  let engine: AndroidBridgeManager;
  beforeEach(() => {
    engine = new AndroidBridgeManager();
  });

  it('a dispatched answer is spoken as unconfirmed and consumes the pending card', () => {
    engine.connectDevice(FULL_CAPS);
    engine.handleIncomingCall({ callerName: 'Rohit' });
    const outcome = mobileCallAnswerOutcome(engine.executeCallAnswer());
    expect(outcome.status).toBe('ANSWER_DISPATCHED');
    expect(outcome.confirmed).toBe(false);
    expect(outcome.consumed).toBe(true);
    // The engine's own unconfirmed Hindi notice is spoken, never "उठा ली गई".
    expect(outcome.spoken).toBe('कॉल उठाने का निर्देश डिवाइस को भेज दिया गया है; पुष्टि बाकी है।');
    expect(outcome.spoken).not.toContain('उठा ली गई');
    expect(engine.getPendingEvent()).toBeNull();
  });

  it('falls back to the generic unconfirmed line when a dispatched verdict carries no notice', () => {
    const outcome = mobileCallAnswerOutcome({ success: false, status: 'ANSWER_DISPATCHED' });
    expect(outcome.consumed).toBe(true);
    expect(outcome.spoken).toBe(MOBILE_CALL_ANSWER_DISPATCHED_LINE);
  });

  it('an unsupported device refusal does not consume the card and speaks the engine notice', () => {
    engine.connectDevice({ ...FULL_CAPS, canAnswerCalls: false, telecomRoleDialer: false, answerCallsPermission: false });
    engine.handleIncomingCall({ callerName: 'Priya' });
    const outcome = mobileCallAnswerOutcome(engine.executeCallAnswer());
    expect(outcome.status).toBe('CALL_ANSWER_UNSUPPORTED');
    expect(outcome.confirmed).toBe(false);
    expect(outcome.consumed).toBe(false);
    expect(outcome.spoken).toContain('इस Android device पर JARVIS को अभी call answer करने की अनुमति नहीं मिली है');
    expect(engine.getPendingEvent()?.status).toBe('AWAITING_APPROVAL');
  });

  it('an emergency-stop refusal is never spoken as answered', () => {
    engine.connectDevice(FULL_CAPS);
    engine.handleIncomingCall({ callerName: 'Boss' });
    engine.setEmergencyStop(true);
    const outcome = mobileCallAnswerOutcome(engine.executeCallAnswer());
    expect(outcome.status).toBe('BLOCKED_EMERGENCY_STOP');
    expect(outcome.consumed).toBe(false);
    expect(outcome.spoken).not.toContain('उठा ली गई');
    expect(engine.getPendingEvent()?.status).toBe('AWAITING_APPROVAL');
  });

  it('a disconnected device refusal is honest', () => {
    engine.disconnectDevice();
    const outcome = mobileCallAnswerOutcome(engine.executeCallAnswer());
    expect(outcome.status).toBe('MOBILE_NOT_CONNECTED');
    expect(outcome.consumed).toBe(false);
    expect(outcome.spoken).toBe('ब्रिज से कोई Android डिवाइस कनेक्ट नहीं है।');
  });
});

describe('mobileMessageReplyOutcome reports the real engine verdict', () => {
  let engine: AndroidBridgeManager;
  beforeEach(() => {
    engine = new AndroidBridgeManager();
  });

  it('an inline reply dispatch is spoken as delivery unconfirmed and consumes the card', () => {
    engine.connectDevice(FULL_CAPS);
    engine.handleIncomingNotification({
      appName: 'WhatsApp',
      packageName: 'com.whatsapp',
      title: 'Rahul',
      text: 'Are you coming?',
    });
    const verdict = engine.executeMessageReply('Approved by user');
    const outcome = mobileMessageReplyOutcome(verdict);
    expect(outcome.status).toBe('REPLY_DISPATCHED');
    expect(outcome.confirmed).toBe(false);
    expect(outcome.consumed).toBe(true);
    // Spoken text is the engine's own unconfirmed notice, never a delivery claim.
    expect(outcome.spoken).toBe(verdict.messageHi);
    expect(outcome.spoken).not.toContain('सफलतापूर्वक');
    expect(engine.getPendingEvent()).toBeNull();
  });

  it('falls back to the generic unconfirmed reply line when a dispatch carries no notice', () => {
    const outcome = mobileMessageReplyOutcome({ success: false, status: 'REPLY_DISPATCHED' });
    expect(outcome.consumed).toBe(true);
    expect(outcome.spoken).toBe(MOBILE_REPLY_DISPATCHED_LINE);
  });

  it('a missing message refusal does not consume the card', () => {
    engine.connectDevice(FULL_CAPS);
    const outcome = mobileMessageReplyOutcome(engine.executeMessageReply('Hello'));
    expect(outcome.status).toBe('REPLY_UNAVAILABLE');
    expect(outcome.consumed).toBe(false);
    expect(outcome.spoken).not.toContain('सफलतापूर्वक');
  });
});

describe('mobileBridgeSpokenOutcomeTruth rejects malformed verdicts', () => {
  it('treats a missing/malformed body as an honest refusal', () => {
    for (const body of [null, undefined, {}, 'ok', 42, { success: 'true' }]) {
      const call = mobileCallAnswerOutcome(body);
      expect(call.confirmed).toBe(false);
      expect(call.consumed).toBe(false);
      expect(call.spoken).toBe(MOBILE_BRIDGE_REFUSED_FALLBACK);
      const reply = mobileMessageReplyOutcome(body);
      expect(reply.spoken).toBe(MOBILE_BRIDGE_REFUSED_FALLBACK);
    }
  });

  it('passes through an English reason when no Hindi notice is present', () => {
    const outcome = mobileCallAnswerOutcome({ success: false, status: 'ROLE_REQUIRED', messageEn: 'Dialer role required.' });
    expect(outcome.spoken).toBe('सर, Dialer role required.');
  });
});

describe('App mobile approval callbacks no longer fake an outcome', () => {
  it('handleAnswerMobileCall reads the engine verdict before speaking', () => {
    const body = handlerBody('handleAnswerMobileCall', 'const handleDeclineMobileCall');
    expect(body).toContain('mobileCallAnswerOutcome(');
    expect(body).toMatch(/if\s*\(outcome\.consumed\)\s*setPendingMobileEvent\(null\)/);
    // The old flat claim must be gone.
    expect(body).not.toContain('कॉल उठा ली गई है।');
  });

  it('handleReplyMobileMessage reads the engine verdict before speaking', () => {
    const body = handlerBody('handleReplyMobileMessage', 'const handleOpenMobileApp');
    expect(body).toContain('mobileMessageReplyOutcome(');
    expect(body).toMatch(/if\s*\(outcome\.consumed\)\s*setPendingMobileEvent\(null\)/);
    // The old flat claim must be gone.
    expect(body).not.toContain('सफलतापूर्वक भेज दिया गया है।');
  });
});
