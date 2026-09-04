import { describe, it, expect } from 'vitest';
import {
  escapeCsvField,
  formatTranscriptForCsv,
  generateCallHistoryCsv,
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
