import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  hasBriefingTelemetry,
  briefingTelemetryKeys,
  noTelemetryNote,
  briefingFallbackText,
} from '../utils/hardening/briefingFallbackTruth';

// Regression guard for item 13. POST /api/mobile/briefing/generate builds a
// local fallback when no model is available. The fallback branched on a single
// boolean — whether any recognised telemetry field was present — and, when none
// was, told the user "No mobile device is currently connected". A snapshot that
// did post a device payload but carried none of the fields this server reads
// (different keys, or a partially-populated snapshot) fell into that branch, so
// the briefing asserted a connection state nobody observed.
//
// server.ts binds a port on import, so the route assertion reads the source
// text, matching mobileTelemetryTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

describe('hasBriefingTelemetry only reports fields that carry a value', () => {
  it('is false for an empty snapshot', () => {
    expect(hasBriefingTelemetry({})).toBe(false);
  });

  it('is false when fields are present but null/undefined', () => {
    expect(hasBriefingTelemetry({ batteryLevelPercent: null, temperatureC: undefined })).toBe(false);
  });

  it('is true for a single real reading', () => {
    expect(hasBriefingTelemetry({ batteryLevelPercent: 0 })).toBe(true);
    expect(hasBriefingTelemetry({ unreadEmails: 3 })).toBe(true);
  });

  it('names the keys that were actually present', () => {
    expect(briefingTelemetryKeys({ batteryLevelPercent: 82, todayEvents: 2 })).toEqual([
      'batteryLevelPercent',
      'todayEvents',
    ]);
  });
});

describe('the empty-snapshot fallback never asserts a connection state', () => {
  it('does not claim a device is disconnected or connected', () => {
    for (const language of ['hindi', 'english']) {
      const text = briefingFallbackText({}, language);
      expect(text).not.toMatch(/No mobile device is currently connected/i);
      expect(text).not.toMatch(/कोई मोबाइल डिवाइस जुड़ा नहीं है/);
      expect(text).not.toMatch(/connected/i);
    }
  });

  it('names the reason instead', () => {
    const text = briefingFallbackText({}, 'english');
    expect(text).toContain('snapshot carried no');
    expect(text).toContain('unavailable');
    expect(noTelemetryNote('english')).toBe(text.replace('Good morning, Sir. ', ''));
  });

  it('renders a Hindi note for the Hindi path', () => {
    expect(briefingFallbackText({}, 'hindi')).toContain('इस स्नैपशॉट में');
  });
});

describe('the fallback still reports real readings', () => {
  it('reads out the values it was given', () => {
    const text = briefingFallbackText(
      { batteryLevelPercent: 82, unreadEmails: 5 },
      'english'
    );
    expect(text).toContain('82 percent');
    expect(text).toContain('5 emails are waiting');
  });

  it('names absent fields as unavailable rather than defaulting them', () => {
    const text = briefingFallbackText({ batteryLevelPercent: 82 }, 'english');
    expect(text).toContain('Weather data is unavailable');
    expect(text).not.toContain('Battery data is unavailable');
  });
});

describe('POST /api/mobile/briefing/generate uses the truth builder', () => {
  it('routes the fallback through briefingFallbackText and drops the pre-fix claim', () => {
    const route = flat.slice(
      flat.indexOf("app.post('/api/mobile/briefing/generate'"),
      flat.indexOf('// ANDROID MOBILE BRIDGE — AUTHENTICATED DEVICE GATEWAY')
    );
    expect(route).toContain('briefingFallbackText(');
    expect(route).not.toContain('No mobile device is currently connected');
    expect(route).not.toContain('कोई मोबाइल डिवाइस जुड़ा नहीं है');
  });
});
