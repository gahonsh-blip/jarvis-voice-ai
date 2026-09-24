import { describe, it, expect } from 'vitest';
import {
  escapeCsvField,
  formatTranscriptForCsv,
  generateCallHistoryCsv,
  filterCallRecords,
} from '../utils/telephonyEngine';
import { CallRecord } from '../types/telephony';

describe('Telephony CSV Export', () => {
  it('should properly escape CSV fields with commas, quotes, and newlines', () => {
    expect(escapeCsvField('')).toBe('');
    expect(escapeCsvField(undefined)).toBe('');
    expect(escapeCsvField(null)).toBe('');
    expect(escapeCsvField('normal text')).toBe('normal text');
    expect(escapeCsvField('text, with comma')).toBe('"text, with comma"');
    expect(escapeCsvField('quote "test" here')).toBe('"quote ""test"" here"');
    expect(escapeCsvField("line 1\nline 2")).toBe("\"line 1\nline 2\"");
  });

  it('should format transcripts into single-line readable strings', () => {
    const formatted = formatTranscriptForCsv([
      { id: '1', speaker: 'agent', text: 'Hello, how can I help?', timestamp: '2026-09-03T10:00:00Z' },
      { id: '2', speaker: 'caller', text: 'I need to schedule an appointment.\nPlease check.', timestamp: '2026-09-03T10:00:05Z' },
    ]);

    expect(formatted).toContain('[AGENT]: Hello, how can I help?');
    expect(formatted).toContain('[CALLER]: I need to schedule an appointment. Please check.');
    expect(formatted).not.toContain('\n');
  });

  it('should generate valid CSV header row for empty call history', () => {
    const csv = generateCallHistoryCsv([]);
    const lines = csv.split('\r\n');
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('Call ID,Direction,Caller Name,Caller Number,Recipient Name,Recipient Number');
    expect(lines[0]).toContain('Summary');
    expect(lines[0]).toContain('Transcript');
  });

  it('should serialize call records into CSV rows with all critical fields', () => {
    const sampleRecord: CallRecord = {
      id: 'call_123',
      direction: 'inbound',
      callerName: 'Dr. John "Doc" Doe',
      callerNumber: '+1 (555) 234-5678',
      recipientName: 'Alex Mercer (JARVIS)',
      recipientNumber: '+1 (555) 728-4827',
      startTime: '2026-09-03T12:00:00Z',
      endTime: '2026-09-03T12:02:30Z',
      durationSeconds: 150,
      status: 'ended',
      mode: 'ai_autonomous',
      sentiment: 'positive',
      intent: 'scheduling_request',
      spamScore: 5,
      objective: 'Screening and confirmation',
      summary: 'Caller requested confirmation, time was verified.',
      followUpActions: ['Sync calendar', 'Send confirmation SMS'],
      aiPersona: 'executive_assistant',
      transcript: [
        { id: 't1', speaker: 'caller', text: 'Hi, confirming tomorrow at 2 PM.', timestamp: '2026-09-03T12:00:05Z' },
        { id: 't2', speaker: 'agent', text: 'Confirmed, tomorrow at 2 PM is locked.', timestamp: '2026-09-03T12:00:10Z' },
      ],
    };

    const csv = generateCallHistoryCsv([sampleRecord]);
    expect(csv).toContain('call_123');
    expect(csv).toContain('"Dr. John ""Doc"" Doe"');
    expect(csv).toContain('+1 (555) 234-5678');
    expect(csv).toContain('150');
    expect(csv).toContain('ai_autonomous');
    expect(csv).toContain('positive');
    expect(csv).toContain('"Caller requested confirmation, time was verified."');
    expect(csv).toContain('Sync calendar; Send confirmation SMS');
    expect(csv).toContain('[CALLER]: Hi, confirming tomorrow at 2 PM. | [AGENT]: Confirmed, tomorrow at 2 PM is locked.');
  });
});

describe('Telephony History Filtering by Date Range & Sentiment', () => {
  const refDate = new Date('2026-09-03T18:00:00.000Z');

  const mockHistory: CallRecord[] = [
    {
      id: 'c_today_pos',
      direction: 'inbound',
      callerName: 'Alice Green',
      callerNumber: '+1 (555) 111-2233',
      recipientName: 'Alex',
      recipientNumber: '+1 (555) 000-0000',
      startTime: '2026-09-03T14:30:00.000Z', // Today
      durationSeconds: 120,
      status: 'ended',
      mode: 'ai_autonomous',
      sentiment: 'positive',
      intent: 'scheduling',
      summary: 'Alice confirmed dental consultation',
      followUpActions: [],
      transcript: [],
    },
    {
      id: 'c_yesterday_urg',
      direction: 'inbound',
      callerName: 'Security Ops',
      callerNumber: '+1 (555) 999-8888',
      recipientName: 'Alex',
      recipientNumber: '+1 (555) 000-0000',
      startTime: '2026-09-02T11:00:00.000Z', // Yesterday
      durationSeconds: 240,
      status: 'ended',
      mode: 'ai_autonomous',
      sentiment: 'urgent',
      intent: 'firewall_alert',
      summary: 'Data breach alert triggered on server 4',
      followUpActions: [],
      transcript: [],
    },
    {
      id: 'c_3days_neg',
      direction: 'outbound',
      callerName: 'Alex',
      callerNumber: '+1 (555) 000-0000',
      recipientName: 'Telecom NOC',
      recipientNumber: '+1 (888) 123-4567',
      startTime: '2026-08-31T09:15:00.000Z', // 3 days ago
      durationSeconds: 60,
      status: 'ended',
      mode: 'ai_autonomous',
      sentiment: 'negative',
      intent: 'outage_escalation',
      summary: 'Packet loss issue unresolved',
      followUpActions: [],
      transcript: [],
    },
    {
      id: 'c_20days_neu',
      direction: 'inbound',
      callerName: 'Courier Dispatch',
      callerNumber: '+1 (555) 444-5555',
      recipientName: 'Alex',
      recipientNumber: '+1 (555) 000-0000',
      startTime: '2026-08-14T10:00:00.000Z', // 20 days ago
      durationSeconds: 45,
      status: 'ended',
      mode: 'ai_autonomous',
      sentiment: 'neutral',
      intent: 'package_delivery',
      summary: 'Delivered parcel to lobby',
      followUpActions: [],
      transcript: [],
    },
    {
      id: 'c_60days_pos',
      direction: 'inbound',
      callerName: 'Old Partner',
      callerNumber: '+1 (555) 777-6666',
      recipientName: 'Alex',
      recipientNumber: '+1 (555) 000-0000',
      startTime: '2026-07-05T10:00:00.000Z', // 60 days ago
      durationSeconds: 180,
      status: 'ended',
      mode: 'ai_autonomous',
      sentiment: 'positive',
      intent: 'collaboration',
      summary: 'Quarterly review',
      followUpActions: [],
      transcript: [],
    },
  ];

  it('should return all records when default options are provided', () => {
    const res = filterCallRecords(mockHistory, { referenceDate: refDate });
    expect(res.length).toBe(5);
  });

  it('should filter accurately by sentiment dropdown value', () => {
    const positiveOnly = filterCallRecords(mockHistory, { sentiment: 'positive', referenceDate: refDate });
    expect(positiveOnly.map((c) => c.id)).toEqual(['c_today_pos', 'c_60days_pos']);

    const urgentOnly = filterCallRecords(mockHistory, { sentiment: 'urgent', referenceDate: refDate });
    expect(urgentOnly.map((c) => c.id)).toEqual(['c_yesterday_urg']);

    const negativeOnly = filterCallRecords(mockHistory, { sentiment: 'negative', referenceDate: refDate });
    expect(negativeOnly.map((c) => c.id)).toEqual(['c_3days_neg']);

    const neutralOnly = filterCallRecords(mockHistory, { sentiment: 'neutral', referenceDate: refDate });
    expect(neutralOnly.map((c) => c.id)).toEqual(['c_20days_neu']);
  });

  it('should filter accurately by date range dropdown value', () => {
    // Today
    const todayCalls = filterCallRecords(mockHistory, { dateRange: 'today', referenceDate: refDate });
    expect(todayCalls.map((c) => c.id)).toEqual(['c_today_pos']);

    // Yesterday
    const yesterdayCalls = filterCallRecords(mockHistory, { dateRange: 'yesterday', referenceDate: refDate });
    expect(yesterdayCalls.map((c) => c.id)).toEqual(['c_yesterday_urg']);

    // Last 7 days
    const last7Days = filterCallRecords(mockHistory, { dateRange: '7d', referenceDate: refDate });
    expect(last7Days.map((c) => c.id)).toEqual(['c_today_pos', 'c_yesterday_urg', 'c_3days_neg']);

    // Last 30 days
    const last30Days = filterCallRecords(mockHistory, { dateRange: '30d', referenceDate: refDate });
    expect(last30Days.map((c) => c.id)).toEqual(['c_today_pos', 'c_yesterday_urg', 'c_3days_neg', 'c_20days_neu']);
  });

  it('should filter accurately when combining Date Range and Sentiment filters', () => {
    // In the last 7 days AND negative
    const recentNegative = filterCallRecords(mockHistory, {
      dateRange: '7d',
      sentiment: 'negative',
      referenceDate: refDate,
    });
    expect(recentNegative.map((c) => c.id)).toEqual(['c_3days_neg']);

    // In the last 7 days AND positive
    const recentPositive = filterCallRecords(mockHistory, {
      dateRange: '7d',
      sentiment: 'positive',
      referenceDate: refDate,
    });
    expect(recentPositive.map((c) => c.id)).toEqual(['c_today_pos']);

    // Yesterday AND positive -> none
    const yesterdayPositive = filterCallRecords(mockHistory, {
      dateRange: 'yesterday',
      sentiment: 'positive',
      referenceDate: refDate,
    });
    expect(yesterdayPositive.length).toBe(0);
  });

  it('should combine Date Range, Sentiment, and Text Search seamlessly', () => {
    const searched = filterCallRecords(mockHistory, {
      dateRange: '7d',
      sentiment: 'urgent',
      searchQuery: 'breach',
      referenceDate: refDate,
    });
    expect(searched.map((c) => c.id)).toEqual(['c_yesterday_urg']);
  });
});

