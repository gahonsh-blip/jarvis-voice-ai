// HERMES JARVIS - Mobile Bridge Engine (Call + Notification + Message Assistant)
// Part 1: connection registry + caller masking + announcements + queue + classifier.
// Written in pure ASCII with \u escapes for Devanagari to survive transport corruption.
import { MobileIncomingCallEvent, MobileNotificationEvent, PendingMobileEvent } from '../types/mobileBridge';
import type { MobileApprovalDecision, MobileAuditEntry, MobilePermissionState } from '../types/mobileBridge';
import { categoryLabel, contentHash, clearNotificationDedupStore, isDuplicateNotification, computeNotificationIdentity } from './mobileNotificationPrivacy';

export interface BridgeRegistration {
  deviceId: string;
  deviceModel?: string;
  androidVersion?: string;
  capabilities: {
    notificationListenerGranted: boolean;
    callDetectionSupported: boolean;
    callAnswerSupported: boolean;
    callAnswerRequiredRole?: string;
    openAppSupported: boolean;
    inlineReplySupported: boolean;
    contactsLookupGranted: boolean;
  };
  connectedAt: string;
  lastSeenAt: string;
  live: boolean;
  sessionTokenHash?: string;
}

const BRIDGE_STORAGE_KEY = 'hermes_jarvis_mobile_bridge_v1';
const BRIDGE_LIVE_TTL_MS = 45 * 1000;

export function loadBridgeRegistration(): BridgeRegistration | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(BRIDGE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BridgeRegistration;
  } catch {
    return null;
  }
}

export function saveBridgeRegistration(reg: BridgeRegistration): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(BRIDGE_STORAGE_KEY, JSON.stringify(reg));
  } catch {
    // ignore
  }
}

export function clearBridgeRegistration(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(BRIDGE_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getBridgeConnectionState(): 'MOBILE_NOT_CONNECTED' | 'PERMISSION_REQUIRED' | 'PARTIALLY_CONNECTED' | 'CONNECTED' | 'LIMITED_CAPABILITY' | 'ERROR' {
  const reg = loadBridgeRegistration();
  if (!reg) return 'MOBILE_NOT_CONNECTED';
  const fresh = Date.now() - Date.parse(reg.lastSeenAt) < BRIDGE_LIVE_TTL_MS;
  if (!fresh) return 'MOBILE_NOT_CONNECTED';
  if (!reg.live) return 'MOBILE_NOT_CONNECTED';
  if (!reg.capabilities.notificationListenerGranted) return 'PERMISSION_REQUIRED';
   return 'CONNECTED';
}

export function maskCallerId(raw?: string): string {
  if (!raw) return 'unknown number';
   const trimmed = raw.trim();
   const digits = trimmed.replace(/\D/g, '');
   if (digits.length >= 10) {
    return `+${digits.slice(0, 3)}****${digits.slice(-4)}`;
  }
  return trimmed || 'unknown number';
}
type AnnouncementLang = string;

function langIsHindi(lang: string): boolean {
  return lang.startsWith('hi') || lang === 'hinglish';
}

export function buildCallAnnouncement(event: MobileIncomingCallEvent, lang: string): string {
  const label = event.callerName || event.callerMasked || 'unknown number';
   const sir = langIsHindi(lang) ? '\u0938\u0930,' : 'Sir,';
   const who = langIsHindi(lang) ? (label + ' \u0915\u093e \u0915\u0949\u0932 \u0906\u092f\u093e \u0939\u0948\u0964') : (label + ' is calling.');
   const ask = langIsHindi(lang) ? '\u0915\u094d\u092f\u093e \u092e\u0948\u0902 \u0915\u0949\u0932 \u0909\u0920\u093e \u0926\u0942\u0902?' : 'Shall I answer the call?';
   return sir + ' ' + who + ' ' + ask;
}

export function buildSensitiveAnnouncement(lang: string): string {
  if (langIsHindi(lang)) {
    return '\u0938\u0930, \u090f\u0915 sensitive notification \u0906\u092f\u093e \u0939\u0948\u0964 \u092e\u0948\u0902\u0928\u0947 \u0909\u0938\u0915\u0940 private details \u0928\u0939\u0940\u0902 \u092a\u094d\u0922\u0940\u0902\u0964';
  }
  return 'Sir, a sensitive notification arrived. I did not read its private details.';
}

export function buildNotificationAnnouncement(event: MobileNotificationEvent, lang: string): string {
  const sir = langIsHindi(lang) ? '\u0938\u0930,' : 'Sir,';
  const app = event.appLabel || categoryLabel(event.category);
  if (event.sensitive) return buildSensitiveAnnouncement(lang);
  if (!event.contentAvailable) {

    return langIsHindi(lang)
      ? (sir + ' ' + app + ' \u092a\u0930 \u090f\u0915 notification \u0906\u092f\u093e \u0939\u0948, \u0932\u0947\u0915\u093f\u0928 \u0938\u0902\u0926\u0947\u0936 \u0915\u093e \u092a\u0942\u0930\u093e content \u0909\u092a\u0932\u092c\u094d\u0927 \u0928\u0939\u0940\u0902 \u0939\u0948\u0964 \u0915\u094d\u092f\u093e \u092e\u0948\u0902 \u0907\u0938\u0915\u093e \u091c\u0935\u093e\u092c \u0926\u0942\u0902?')
      : (sir + ' a notification arrived on ' + app + ' but the full message content is not available. Shall I reply?');
  }
  const sender = event.senderName || event.title || 'someone';
  if (langIsHindi(lang)) {

    return sir + ' ' + app + ' \u092a\u0930 ' + sender + ' \u0915\u093e \u0938\u0902\u0926\u0947\u0936 \u0906\u092f\u093e \u0939\u0948\u0964 \u0909\u0928\u094d\u0939\u094b\u0902\u0928\u0947 \u0932\u093f\u0916\u093e \u0939\u0948: ' + (event.body || event.bodyPreview || '') + '. \u0915\u094d\u092f\u093e \u092e\u0948\u0902 \u0907\u0938\u0915\u093e \u091c\u0935\u093e\u092c \u0926\u0942\u0902?';
  }
  return sir + ' A message arrived from ' + sender + ' on ' + app + ': ' + (event.body || event.bodyPreview || '') + '. Shall I reply?';
}

export function buildReplyAsk(lang: string): string {
  if (langIsHindi(lang)) {
    return '\u0938\u0930, \u0915\u094d\u092f\u093e \u092e\u0948\u0902 \u0907\u0938\u0915\u093e \u091c\u0935\u093e\u092c \u092d\u0947\u091c \u0926\u0942\u0902?';
  }
  return 'Sir, shall I send the reply?';
}

export function buildCallAnswerUnsupported(lang: string): string {
  if (langIsHindi(lang)) {

    return '\u0938\u0930, \u0907\u0938 Android device \u092a\u0930 JARVIS \u0915\u094b \u0905\u092d\u0940 call answer \u0915\u0930\u0928\u0947 \u0915\u0940 \u0905\u0928\u0941\u092e\u0924\u093f \u0928\u0939\u0940\u0902 \u092e\u093f\u0932\u0940 \u0939\u0948\u0964 \u0915\u0943\u0932 \u0909\u0920\u093e\u0928\u0947 \u0915\u0947 \u0932\u093f\u090f \u0906\u0935\u0936\u094d\u092f\u0915 \u092a\u0930\u092e\u093f\u0936\u0928/\u0930\u094b\u0932 \u0915\u0940 \u0906\u0935\u0936\u094d\u092f\u0915\u0924\u093e \u091a\u093e\u0939\u093f\u090f\u0964';
  }
  return 'Sir, JARVIS does not currently have permission to answer calls on this Android device. An Android role such as default dialer is required.';
}
const QUEUE_STORAGE_KEY = 'hermes_jarvis_mobile_pending_queue_v1';

function loadQueue(): PendingMobileEvent[] {
 {
  if (typeof window === 'undefined') return [];
   try {
     const raw = localStorage.getItem(QUEUE_STORAGE_KEY);
     if (!raw) return [];
     return JSON.parse(raw) as PendingMobileEvent[];
   } catch {
     return [];
   }
 }
}

function persistQueue(queue: PendingMobileEvent[]): void {
 {
  if (typeof window === 'undefined') return;
   try { localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue)); } catch {}
}
}

export function enqueuePendingEvent(event: PendingMobileEvent): void {
 {
  const queue = loadQueue().filter((e) => e.status === 'PENDING_APPROVAL');
   queue.push(event);
   persistQueue(queue);
}
}

export function getPendingQueue(): PendingMobileEvent[] {
 {
  return loadQueue().filter((e) => e.status === 'PENDING_APPROVAL');
}
}

export function getTopPendingEvent(): PendingMobileEvent | undefined {
 {
  return getPendingQueue()[0];
}
}

export function updatePendingEventStatus(eventId: string, status: PendingMobileEvent['status']): void {
 {
  const queue = loadQueue();
   const idx = queue.findIndex((e) => e.eventId === eventId);
    if (idx >= 0) {
     queue[idx] = { ...queue[idx],  status: status };
     persistQueue(queue);
   }
}
}

export function clearPendingQueue(): void {
 {
  if (typeof window === 'undefined') return;
   try { localStorage.removeItem(QUEUE_STORAGE_KEY); } catch {}
}
}

const CLEAR_NO = ['no', 'nahi', '\u0928\u0939\u0940\u0902', 'cancel', 'dismiss', 'decline', '\u092e\u0924 \u0909\u0920\u093e\u0913', '\u092e\u0924 \u092d\u0947\u091c\u094b'];

const CLEAR_YES = [
  'yes', 'answer', 'answer it', 'answer the call', 'pick up', 'pick it up', 'reply', 'send it', 'send reply', 'yes reply', 'go ahead',
  'utha lo', 'jawab do', 'bhej do', 'call utha lo', 'call utha do', 'reply bhej do',
  '\u0939\u093e\u0901', '\u0939\u093e\u0902', '\u091c\u0940', '\u091c\u0940 \u0939\u093e\u0901', '\u0920\u0940\u0915 \u0939\u0948',
  '\u0909\u0920\u093e \u0932\u094b', '\u0915\u0947\u0923\u094b', '\u0915\u094d\u092f\u093e \u0909\u0920\u093e\u0913', '\u0915\u093e\u0932 \u0909\u0920\u093e \u0932\u094b', '\u0915\u093e\u0932 \u0909\u0920\u093e\u0913',
  '\u0930\u093f\u092a\u094d\u0932\u093e\u0908 \u0915\u0930\u094b', '\u091c\u0935\u093e\u092c \u0926\u094b', '\u092d\u0947\u091c \u0926\u094b', '\u0930\u093f\u092a\u094d\u0932\u093e\u0908 \u0926\u094b',
];

function normalizeSpeech(text: string): string {
 {
  return text.toLowerCase().replace(/[.!?\u0964]+/g, '').replace(/\s+/g, ' ').trim();
}
}

export function classifyApproval(text: string): MobileApprovalDecision | null {
 {
  const t = normalizeSpeech(text);
   if (!t) return null;
   let i = 0;
   for (i = 0; i < CLEAR_NO.length; i++) {
     var p = CLEAR_NO[i];
     if (t === p || t.indexOf(p + ' ') === 0 || t.indexOf(p + '\u0964') === 0) return 'DECLINE';
   }
   for (i = 0; i < CLEAR_YES.length; i++) {
     const p = CLEAR_YES[i];
     if (t === p || t.indexOf(p + ' ') === 0 || t.indexOf(p + '\u0964') === 0) return 'ANSWER';
   }
   return null;
}
}

export function isExplicitApproval(text: string): boolean {
 {
  return classifyApproval(text) === 'ANSWER';
}
}
const AUDIT_STORAGE_KEY = 'hermes_jarvis_mobile_audit_v1';
const MAX_AUDIT_ENTRIES = 200;

function auditId(): string {
  return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
}

const SECRET_PATTERN = /(otp|password|passcode|pin|token|secret|verification code|cvv|auth code)\s*[:=]?\s*[0-9a-zA-Z]{4,}/i;

function redactAuditValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.replace(SECRET_PATTERN, '$1: [REDACTED]');
  }
  return undefined;
}

function redactAuditSecrets(entry: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    out[key] = redactAuditValue(value);
  }
  return out;
}

export function logMobileAudit(entry: Omit<MobileAuditEntry, 'id' | 'timestamp'>): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    const list: MobileAuditEntry[] = raw ? JSON.parse(raw) : [];
    const sanitized = redactAuditSecrets(entry as unknown as Record<string, unknown>);
    list.unshift({ ...sanitized, id: auditId(), timestamp: new Date().toISOString() } as MobileAuditEntry);
    const trimmed = list.slice(0, MAX_AUDIT_ENTRIES);
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

export function getMobileAuditLog(): MobileAuditEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearMobileAuditLog(): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(AUDIT_STORAGE_KEY); } catch {}
}

export type MobileActionGate = { allowed: true } | { allowed: false; reason: 'KILL_SWITCH' | 'NO_BRIDGE' | 'NO_APPROVAL' | 'CAPABILITY_UNAVAILABLE' | 'PERMISSION_DENIED' };

export function evaluateMobileActionGate(params: {
  bridgeLive: boolean;
  approved: boolean;
  permission: MobilePermissionState;
  capabilityCheck?: () => boolean;
  emergencyActive: boolean;
}): MobileActionGate {
  if (params.emergencyActive) return { allowed: false, reason: 'KILL_SWITCH' };
  if (!params.bridgeLive) return { allowed: false, reason: 'NO_BRIDGE' };
  if (!params.approved) return { allowed: false, reason: 'NO_APPROVAL' };
  if (params.permission === 'DENIED') return { allowed: false, reason: 'PERMISSION_DENIED' };
   if (params.capabilityCheck && !params.capabilityCheck() ) return { allowed: false, reason: 'CAPABILITY_UNAVAILABLE' };
   return { allowed: true };
}

export interface SimulatedMobileEvent {
  kind: 'INCOMING_CALL' | 'NOTIFICATION' | 'APPROVAL' | 'REJECTION' | 'CALL_ANSWER' | 'REPLY' | 'PERMISSION_DENIED' | 'PERMISSION_GRANTED' | 'DUPLICATE_NOTIFICATION' | 'MULTIPLE_PENDING' | 'BRIDGE_DISCONNECT';
   payload?: Record<string, unknown>;
   simulationOnly: true;
}

let simulatedCounter = 0;

export function createSimulatedBridgeEvent(kind: SimulatedMobileEvent['kind'], payload?: Record<string, unknown>): SimulatedMobileEvent {
 {
  simulatedCounter += 1;
   return { kind: kind, payload: payload, simulationOnly: true };
}
}

export function simulationOnly(v: unknown): boolean {
  return Boolean(v && typeof v === 'object' && ((v as { simulationOnly?: boolean; isSimulated?: boolean }).simulationOnly === true || (v as { simulationOnly?: boolean; isSimulated?: boolean }).isSimulated === true));
}
