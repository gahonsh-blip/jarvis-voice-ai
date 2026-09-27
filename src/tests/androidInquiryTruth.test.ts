import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { androidBridgeEngine, notificationDeduplicator } from '../utils/androidBridgeEngine';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import { MemoryStore } from '../types';

// Zero-fake-success guard for the Android-inquiry branches of the offline engine.
//
// Two read-only inquiries were reported as completed actions:
//   * "who is calling" returned `intent: 'answer_call'` with `actionExecuted: true`.
//     App.tsx routes `data.actionExecuted && data.intent` to handleExecuteAction(),
//     whose `answer_call` case calls handleAnswerCall() — so merely ASKING who is
//     calling would ANSWER the call. That is an irreversible telephony side effect
//     triggered by a read.
//   * "any notification?" returned `intent: 'open_notepad'` with
//     `actionExecuted: true`, so a query opened the Notes workspace and inflated
//     the user-visible "Autonomous Actions Executed" counter.
//
// A read of the pending event is not an action; neither branch may claim one.

const CAPS = {
  deviceId: 'inquiry_truth_phone',
  deviceName: 'Inquiry Truth Phone',
  model: 'Pixel 8 Pro',
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

const NOTIFICATION = {
  notificationId: 'notif_inquiry_1',
  appName: 'WhatsApp',
  packageName: 'com.whatsapp',
  title: 'Rahul Verma',
  text: 'Are you free for a call?',
  sender: 'Rahul Verma',
  category: 'SMS' as const,
  timestamp: new Date().toISOString(),
  hasInlineReply: false,
};

function freshMemory(): MemoryStore {
  return {
    name: '',
    notes: [],
    customKeyValues: {},
    stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '2026-09-01T00:00:00.000Z' },
  };
}

describe('Android inquiry branches never claim a side effect', () => {
  beforeEach(() => {
    notificationDeduplicator.clear();
    androidBridgeEngine.disconnectDevice('test reset');
    androidBridgeEngine.connectDevice(CAPS);
  });

  it('asking "who is calling" reports the caller without an answer_call intent or execution', () => {
    androidBridgeEngine.handleIncomingCall({
      callerName: 'Rahul Verma',
      callerNumber: '+91 9876543210',
    });

    const res = processOfflineCommand('किसका कॉल है', freshMemory());

    // The caller is reported truthfully…
    expect(res.spokenText).toContain('Rahul Verma');
    // …but this is a read, not an answer dispatch.
    expect(res.intent).not.toBe('answer_call');
    expect(res.intent).toBe('caller_inquiry');
    expect(res.actionExecuted).toBe(false);
    expect((res.actionDetail as any)?.type).not.toBe('answer_call');
  });

  it('asking "who is calling" with no active call never claims execution', () => {
    const res = processOfflineCommand('who is calling', freshMemory());

    expect(res.intent).toBe('caller_inquiry');
    expect(res.actionExecuted).toBe(false);
    expect((res.actionDetail as any)?.type).not.toBe('answer_call');
  });

  it('asking for notifications reads the pending message without opening Notepad or claiming execution', () => {
    const notificationResult = androidBridgeEngine.handleIncomingNotification(NOTIFICATION);
    expect(notificationResult.announced).toBe(true);

    const res = processOfflineCommand('कोई notification आया क्या', freshMemory());

    expect(res.intent).not.toBe('open_notepad');
    expect(res.intent).toBe('notification_inquiry');
    expect(res.actionExecuted).toBe(false);
    expect((res.actionDetail as any)?.type).not.toBe('open_notepad');
  });

  it('notification inquiry with an empty queue never claims execution', () => {
    const res = processOfflineCommand('any notifications', freshMemory());

    expect(res.intent).toBe('notification_inquiry');
    expect(res.actionExecuted).toBe(false);
    expect((res.actionDetail as any)?.type).not.toBe('open_notepad');
  });
});

// Source-level guard: pin the offline inquiry section so a future edit cannot
// silently reintroduce the `answer_call`/`open_notepad` fake success.
const engineSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/utils/localJarvisEngine.ts'),
  'utf8',
);

describe('offline inquiry section source guard', () => {
  it('the caller inquiry branch does not emit an answer_call intent or executed action', () => {
    const marker = '0.6 Android Mobile Assistant Inquiries';
    const start = engineSource.indexOf(marker);
    expect(start, marker).toBeGreaterThan(-1);
    const section = engineSource
      .slice(start, engineSource.indexOf("lower.includes('youtube')", start))
      .replace(/\s+/g, ' ');

    expect(section).not.toContain("intent: 'answer_call'");
    expect(section).not.toContain("intent: 'open_notepad'");
    expect(section).not.toContain('actionExecuted: true');
  });
});
