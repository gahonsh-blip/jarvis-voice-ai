import {
  CallRecord,
  TelephonySettings,
  CallStatus,
  CallTurn,
  DEFAULT_TELEPHONY_SETTINGS,
  DEFAULT_CONTACTS,
  CALL_SCENARIO_PRESETS,
  SIMULATED_INCOMING_CALLERS,
  SimulatedCallerPersona,
  ContactItem,
  getDisplayCallerName,
} from '../types/telephony';
import { telephonyAudio } from './telephonyAudio';

const STORAGE_KEY_CALLS = 'hermes_jarvis_telephony_calls_v1';
const STORAGE_KEY_SETTINGS = 'hermes_jarvis_telephony_settings_v1';
const STORAGE_KEY_CONTACTS = 'hermes_jarvis_telephony_contacts_v1';

/**
 * Load call history from local storage
 */
export function loadLocalCallHistory(): CallRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const data = localStorage.getItem(STORAGE_KEY_CALLS);
    if (data) {
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Failed to load call history:', err);
  }
  return [];
}

/**
 * Save call history to local storage
 */
export function saveLocalCallHistory(calls: CallRecord[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_CALLS, JSON.stringify(calls.slice(0, 100)));
  } catch (err) {
    console.warn('Failed to save call history:', err);
  }
}

/**
 * Load telephony settings
 */
export function loadLocalTelephonySettings(): TelephonySettings {
  if (typeof window === 'undefined') return DEFAULT_TELEPHONY_SETTINGS;
  try {
    const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (data) {
      return { ...DEFAULT_TELEPHONY_SETTINGS, ...JSON.parse(data) };
    }
  } catch (err) {
    console.warn('Failed to load telephony settings:', err);
  }
  return DEFAULT_TELEPHONY_SETTINGS;
}

/**
 * Save telephony settings
 */
export function saveLocalTelephonySettings(settings: TelephonySettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save telephony settings:', err);
  }
}

/**
 * Load contacts
 */
export function loadLocalContacts(): ContactItem[] {
  if (typeof window === 'undefined') return DEFAULT_CONTACTS;
  try {
    const data = localStorage.getItem(STORAGE_KEY_CONTACTS);
    if (data) {
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn('Failed to load contacts:', err);
  }
  return DEFAULT_CONTACTS;
}

/**
 * Save contacts
 */
export function saveLocalContacts(contacts: ContactItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_CONTACTS, JSON.stringify(contacts));
  } catch (err) {
    console.warn('Failed to save contacts:', err);
  }
}

/**
 * Evaluates whether an incoming call or caller statement represents spam/robocall
 */
export function evaluateSpamRisk(callerNumber: string, firstLine: string): { isSpam: boolean; score: number; reason?: string } {
  const lower = (firstLine || '').toLowerCase();
  let score = 0;
  let reason = '';

  const spamKeywords = [
    { word: 'solar', weight: 45, desc: 'Solar panel sales solicitation' },
    { word: 'pre-selected', weight: 40, desc: 'Pre-selected marketing script' },
    { word: 'congratulations', weight: 35, desc: 'Prize/lottery marketing pitch' },
    { word: 'utility bill', weight: 35, desc: 'Energy switch solicitation' },
    { word: 'credit card debt', weight: 50, desc: 'Debt relief telemarketing' },
    { word: 'tax relief', weight: 45, desc: 'Tax relief spam' },
    { word: 'irs lawsuit', weight: 60, desc: 'Fraudulent government impersonation' },
    { word: 'lower your interest', weight: 40, desc: 'Financial solicitation' },
    { word: 'warranty', weight: 45, desc: 'Extended auto warranty solicitation' },
  ];

  for (const item of spamKeywords) {
    if (lower.includes(item.word)) {
      score += item.weight;
      if (!reason) reason = item.desc;
    }
  }

  // 1-800 or spoofed repetitive numbers without contact match
  if (callerNumber.startsWith('+1 (800) 991') || callerNumber.includes('000-0000')) {
    score += 30;
    if (!reason) reason = 'Suspicious toll-free robocaller prefix';
  }

  const isSpam = score >= 50;
  return { isSpam, score: Math.min(score, 100), reason: reason || 'Verified Legitimate Caller' };
}

/**
 * Call Turn Processing via Backend Server API with fallback
 */
export async function processTelephonyTurn(params: {
  callId: string;
  direction: 'outbound' | 'inbound';
  callerName: string;
  recipientName: string;
  objective?: string;
  dialogueHistory: CallTurn[];
  latestInput: string;
  speaker: 'caller' | 'callee' | 'agent';
  aiPersona?: string;
}): Promise<{
  replyText: string;
  whisperTip?: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  intent: string;
  shouldEndCall: boolean;
  followUpActions?: string[];
}> {
  try {
    const res = await fetch('/api/telephony/handle-turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      const data = await res.json();
      return {
        replyText: data.replyText,
        whisperTip: data.whisperTip,
        sentiment: data.sentiment || 'neutral',
        intent: data.intent || 'conversation',
        shouldEndCall: !!data.shouldEndCall,
        followUpActions: data.followUpActions || [],
      };
    }
  } catch (err) {
    console.warn('[Telephony Engine] Server handle-turn offline, using local fallback:', err);
  }

  // Local rule-based AI call dialogue logic
  return generateLocalCallTurn(params);
}

/**
 * Local AI Call Dialogue Logic (works 100% offline without internet)
 */
export function generateLocalCallTurn(params: {
  direction: 'outbound' | 'inbound';
  callerName: string;
  recipientName: string;
  objective?: string;
  dialogueHistory: CallTurn[];
  latestInput: string;
  aiPersona?: string;
}): {
  replyText: string;
  whisperTip?: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  intent: string;
  shouldEndCall: boolean;
  followUpActions?: string[];
} {
  const input = (params.latestInput || '').toLowerCase();
  const historyLen = params.dialogueHistory.length;

  // OUTBOUND CALL LOGIC (JARVIS calling on behalf of Alex)
  if (params.direction === 'outbound') {
    if (input.includes('hello') || input.includes('speaking') || historyLen <= 2) {
      const objText = params.objective || 'Alex’s upcoming schedule and priorities';
      return {
        replyText: `Hello, this is JARVIS, autonomous executive assistant calling on behalf of Alex. I am calling regarding ${objText}. Do you have a moment to coordinate this?`,
        whisperTip: 'Confirm contact availability and state primary request.',
        sentiment: 'neutral',
        intent: 'greeting_and_objective',
        shouldEndCall: false,
      };
    }

    if (input.includes('yes') || input.includes('sure') || input.includes('go ahead') || input.includes('can help')) {
      if (params.objective?.toLowerCase().includes('reschedule')) {
        return {
          replyText: 'Excellent. Alex has an appointment scheduled for Tuesday, but an urgent operational conflict arose. We would like to reschedule to this Friday afternoon between 2:00 PM and 4:00 PM. Does Dr. Wayne have an opening in that window?',
          whisperTip: 'State requested Friday 2-4 PM reschedule window.',
          sentiment: 'positive',
          intent: 'reschedule_request',
          shouldEndCall: false,
        };
      }
      return {
        replyText: `Thank you. Regarding our objective, Alex requested that we finalize the details and verify the next action steps with you today.`,
        whisperTip: 'Inquire about next steps and scheduling.',
        sentiment: 'positive',
        intent: 'details_inquiry',
        shouldEndCall: false,
      };
    }

    if (input.includes('friday') || input.includes('3:00') || input.includes('available') || input.includes('confirmed')) {
      return {
        replyText: 'Friday at 3:00 PM works perfectly. I have locked this into Alex’s calendar and synced our reminders. Is there any pre-visit paperwork or preparation we should have ready?',
        whisperTip: 'Lock appointment to calendar and ask for paperwork requirements.',
        sentiment: 'positive',
        intent: 'confirmation',
        shouldEndCall: false,
        followUpActions: ['Sync Friday 3:00 PM appointment to calendar', 'Prepare photo ID and insurance card'],
      };
    }

    if (input.includes('bye') || input.includes('thank you') || input.includes('all set') || input.includes('see you')) {
      return {
        replyText: 'Wonderful. Thank you so much for your assistance. Have a productive day. Goodbye!',
        whisperTip: 'Wrap up call politely and terminate line.',
        sentiment: 'positive',
        intent: 'call_wrapup',
        shouldEndCall: true,
        followUpActions: ['Call completed successfully', 'Calendar event dispatched'],
      };
    }

    // Default outbound turn
    return {
      replyText: 'Understood. I have logged that note directly into Alex’s briefing system. Would you like me to note anything else before we conclude?',
      whisperTip: 'Ask if any additional items need to be documented.',
      sentiment: 'neutral',
      intent: 'information_intake',
      shouldEndCall: false,
    };
  }

  // INBOUND CALL LOGIC (AI Receptionist handling incoming caller)
  if (input.includes('gate') || input.includes('code') || input.includes('buzz') || input.includes('delivery')) {
    return {
      replyText: 'Hello Dave. For building access, the resident gate code is #4092. You may leave the package right outside door 4B on the second level. Thank you for delivering!',
      whisperTip: 'Provided gate code #4092 and delivery instructions.',
      sentiment: 'positive',
      intent: 'delivery_gate_code',
      shouldEndCall: false,
      followUpActions: ['Gate code provided to courier Dave (#4092)', 'Package expected at front door 4B'],
    };
  }

  if (input.includes('meeting') || input.includes('sync') || input.includes('demo') || input.includes('free')) {
    return {
      replyText: 'Hello Ms. Rostova. Alex is currently in deep focus mode, but has your review marked as priority. Would 4:00 PM EST or tomorrow at 10:00 AM work best for a 15-minute sync? I can book it instantly.',
      whisperTip: 'Offer 4:00 PM today or 10:00 AM tomorrow.',
      sentiment: 'positive',
      intent: 'meeting_scheduling',
      shouldEndCall: false,
      followUpActions: ['Hold 4:00 PM EST on calendar for Elena Rostova', 'Notify Alex via Telegram'],
    };
  }

  if (input.includes('solar') || input.includes('utility') || input.includes('debt') || input.includes('pre-selected')) {
    return {
      replyText: 'This line is protected by HERMES JARVIS Autonomous Call Screening. This number does not accept unsolicited marketing inquiries. We are declining this offer and adding your caller ID to our blocked directory. Goodbye.',
      whisperTip: 'Spam detected. Terminating line automatically.',
      sentiment: 'negative',
      intent: 'spam_rejection',
      shouldEndCall: true,
      followUpActions: ['Blocked spam marketing number', 'Added to automated reject list'],
    };
  }

  if (input.includes('confirm') || input.includes('friday') || input.includes('doctor') || input.includes('clinic')) {
    return {
      replyText: 'Thank you Sarah. I have confirmed Alex’s attendance for Friday at 3:00 PM. I will ensure Alex brings his photo ID and arrives 10 minutes early. Thank you for calling to confirm!',
      whisperTip: 'Confirmed Friday 3 PM appointment with medical office.',
      sentiment: 'positive',
      intent: 'appointment_confirmed',
      shouldEndCall: false,
      followUpActions: ['Medical appointment confirmed for Friday 3:00 PM', 'Reminder set 1 hour prior'],
    };
  }

  if (input.includes('bye') || input.includes('thanks') || input.includes('see you') || input.includes('goodbye')) {
    return {
      replyText: 'Thank you for calling. I have relayed all details to Alex. Have a wonderful day!',
      whisperTip: 'End call politely.',
      sentiment: 'positive',
      intent: 'call_wrapup',
      shouldEndCall: true,
    };
  }

  // Default Inbound Receptionist Turn
  return {
    replyText: 'Thank you for that information. I have documented your message in full and prioritized it for Alex’s immediate review. May I take your callback number or any other detail?',
    whisperTip: 'Message logged. Inquire if caller has any other urgent note.',
    sentiment: 'neutral',
    intent: 'message_taking',
    shouldEndCall: false,
    followUpActions: ['Relay detailed caller notes to Alex'],
  };
}

/**
 * Generates an executive summary and key takeaways from a completed call transcript
 */
export function summarizeCallTranscript(transcript: CallTurn[], direction: 'outbound' | 'inbound', counterpart: string): {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  followUpActions: string[];
} {
  if (!transcript || transcript.length === 0) {
    return {
      summary: `Call with ${counterpart} ended with no conversation recorded.`,
      sentiment: 'neutral',
      followUpActions: ['No action required'],
    };
  }

  const fullText = transcript.map((t) => `${t.speaker}: ${t.text}`).join('\n').toLowerCase();
  let sentiment: 'positive' | 'neutral' | 'negative' | 'urgent' = 'positive';
  const followUps: string[] = [];

  if (fullText.includes('solar') || fullText.includes('spam') || fullText.includes('pre-selected') || fullText.includes('decline')) {
    sentiment = 'negative';
    followUps.push('Added caller to spam blocklist');
  } else if (fullText.includes('urgent') || fullText.includes('emergency') || fullText.includes('asap')) {
    sentiment = 'urgent';
    followUps.push('High priority: follow up with caller immediately');
  }

  if (fullText.includes('reschedule') || fullText.includes('appointment') || fullText.includes('friday') || fullText.includes('calendar')) {
    followUps.push('Calendar appointment updated');
  }

  if (fullText.includes('gate') || fullText.includes('delivery') || fullText.includes('package')) {
    followUps.push('Delivery gate access code provided (#4092)');
  }

  if (fullText.includes('sync') || fullText.includes('meeting') || fullText.includes('demo')) {
    followUps.push('Schedule 15-minute executive briefing with partner');
  }

  if (followUps.length === 0) {
    followUps.push(`Review notes from call with ${counterpart}`);
  }

  const summary =
    direction === 'outbound'
      ? `JARVIS autonomously dialed ${counterpart}. Successfully conveyed objectives, gathered scheduling and operational updates, and synced action items.`
      : `JARVIS AI Receptionist answered incoming call from ${counterpart}. Screened inquiry, confirmed schedule/delivery notes, and logged action items.`;

  return { summary, sentiment, followUpActions: followUps };
}

/**
 * Convenience wrapper matching evaluateSpamRisk
 */
export function evaluateSpamScore(firstLine: string, callerName: string): { score: number; reasons: string[] } {
  const result = evaluateSpamRisk(callerName, firstLine);
  return {
    score: result.score,
    reasons: result.reason ? [result.reason] : [],
  };
}

/**
 * Convenience wrapper matching summarizeCallTranscript
 */
export function generateCallSummary(call: CallRecord): {
  summary: string;
  sentiment: 'positive' | 'neutral' | 'negative' | 'urgent';
  followUpActions: string[];
} {
  const counterpart = call.direction === 'outbound' ? call.recipientName : call.callerName;
  return summarizeCallTranscript(call.transcript, call.direction, counterpart);
}

/**
 * Escapes a field for RFC-4180 compliant CSV formatting
 */
export function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats transcript turns into a readable single-line format for CSV
 */
export function formatTranscriptForCsv(transcript?: CallTurn[]): string {
  if (!transcript || !Array.isArray(transcript) || transcript.length === 0) return '';
  return transcript
    .map((turn) => `[${(turn.speaker || 'UNKNOWN').toUpperCase()}]: ${turn.text ? turn.text.replace(/\r?\n/g, ' ') : ''}`)
    .join(' | ');
}

/**
 * Converts call history records into a clean, RFC-4180 compliant CSV string
 */
export function generateCallHistoryCsv(history: CallRecord[]): string {
  const headers = [
    'Call ID',
    'Direction',
    'Caller Name',
    'Caller Number',
    'Recipient Name',
    'Recipient Number',
    'Start Time',
    'End Time',
    'Duration (Seconds)',
    'Status',
    'Mode',
    'Sentiment',
    'Intent',
    'Spam Score',
    'Objective',
    'Summary',
    'Follow-Up Actions',
    'AI Persona',
    'Transcript',
  ];

  const rows = (history || []).map((call) => [
    call.id || '',
    call.direction || '',
    call.callerName || '',
    call.callerNumber || '',
    call.recipientName || '',
    call.recipientNumber || '',
    call.startTime || '',
    call.endTime || '',
    call.durationSeconds ?? 0,
    call.status || '',
    call.mode || '',
    call.sentiment || '',
    call.intent || '',
    call.spamScore !== undefined ? call.spamScore : '',
    call.objective || '',
    call.summary || '',
    Array.isArray(call.followUpActions) ? call.followUpActions.join('; ') : '',
    call.aiPersona || '',
    formatTranscriptForCsv(call.transcript),
  ]);

  return [
    headers.map(escapeCsvField).join(','),
    ...rows.map((row) => row.map(escapeCsvField).join(',')),
  ].join('\r\n');
}

/**
 * Initiates browser download of the call history as a CSV file
 */
export function downloadCallHistoryCsv(history: CallRecord[], filename?: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const csvContent = generateCallHistoryCsv(history);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const downloadName = filename || `hermes_jarvis_call_history_${new Date().toISOString().slice(0, 10)}_${Date.now()}.csv`;

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', downloadName);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/**
 * Convenience wrapper for turn processing
 */
export async function processCallTurnWithAi(params: {
  callerUtterance: string;
  transcript: CallTurn[];
  activeCall: CallRecord;
  settings: TelephonySettings;
}): Promise<{
  replyText: string;
  whisperTip?: string;
  sentiment?: 'positive' | 'neutral' | 'negative' | 'urgent';
  shouldEndCall?: boolean;
}> {
  return processTelephonyTurn({
    callId: params.activeCall.id,
    direction: params.activeCall.direction,
    callerName: params.activeCall.callerName,
    recipientName: params.activeCall.recipientName,
    objective: params.activeCall.objective,
    dialogueHistory: params.transcript,
    latestInput: params.callerUtterance,
    speaker: params.activeCall.direction === 'outbound' ? 'callee' : 'caller',
    aiPersona: params.settings.aiPersona,
  });
}

export type DateRangeFilter = 'all' | 'today' | 'yesterday' | '7d' | '30d';
export type SentimentFilter = 'all' | 'positive' | 'neutral' | 'negative' | 'urgent';

export interface CallFilterOptions {
  searchQuery?: string;
  dateRange?: DateRangeFilter;
  sentiment?: SentimentFilter;
  maskUnknownEnabled?: boolean;
  contacts?: ContactItem[];
  referenceDate?: Date;
}

/**
 * Deterministically filters call history records by date range, sentiment, and search query
 */
export function filterCallRecords(
  records: CallRecord[],
  options: CallFilterOptions = {}
): CallRecord[] {
  const {
    searchQuery = '',
    dateRange = 'all',
    sentiment = 'all',
    maskUnknownEnabled = true,
    contacts = DEFAULT_CONTACTS,
    referenceDate = new Date(),
  } = options;

  const q = searchQuery.trim().toLowerCase();
  const refTime = referenceDate.getTime();

  return records.filter((c) => {
    // 1. Sentiment filter
    if (sentiment !== 'all') {
      if (!c.sentiment || c.sentiment.toLowerCase() !== sentiment.toLowerCase()) {
        return false;
      }
    }

    // 2. Date Range filter
    if (dateRange !== 'all') {
      const callDate = new Date(c.startTime);
      if (!isNaN(callDate.getTime())) {
        if (dateRange === 'today') {
          const isToday =
            callDate.getFullYear() === referenceDate.getFullYear() &&
            callDate.getMonth() === referenceDate.getMonth() &&
            callDate.getDate() === referenceDate.getDate();
          if (!isToday) return false;
        } else if (dateRange === 'yesterday') {
          const yesterday = new Date(referenceDate);
          yesterday.setDate(yesterday.getDate() - 1);
          const isYesterday =
            callDate.getFullYear() === yesterday.getFullYear() &&
            callDate.getMonth() === yesterday.getMonth() &&
            callDate.getDate() === yesterday.getDate();
          if (!isYesterday) return false;
        } else if (dateRange === '7d') {
          const diffMs = refTime - callDate.getTime();
          if (diffMs < 0 || diffMs > 7 * 24 * 60 * 60 * 1000) return false;
        } else if (dateRange === '30d') {
          const diffMs = refTime - callDate.getTime();
          if (diffMs < 0 || diffMs > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }
    }

    // 3. Search query
    if (q) {
      const effectiveCaller =
        c.direction === 'outbound'
          ? c.recipientName
          : getDisplayCallerName(c.callerName, c.callerNumber, contacts, maskUnknownEnabled);
      const matchesSearch =
        effectiveCaller.toLowerCase().includes(q) ||
        (c.callerName && c.callerName.toLowerCase().includes(q)) ||
        (c.recipientName && c.recipientName.toLowerCase().includes(q)) ||
        (c.callerNumber && c.callerNumber.toLowerCase().includes(q)) ||
        (c.summary && c.summary.toLowerCase().includes(q)) ||
        (c.intent && c.intent.toLowerCase().includes(q));
      if (!matchesSearch) return false;
    }

    return true;
  });
}


