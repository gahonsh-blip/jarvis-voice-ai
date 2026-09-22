import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// The offline engine stopped inventing weather readings in commit 4a98514, but
// the live HTTP path in server.ts was missed: its `weather_inquiry` case still
// answered with a constant 27°C / 48% / 'New Delhi' presented as current
// conditions, and GET /api/mobile/telemetry returned the same fixed snapshot.
// No weather provider is wired into the server process, so those numbers cannot
// be a real reading. These tests pin the live path to the honest wording, using
// the same source-scan approach as androidBridgeHttpPrivacy.test.ts because the
// handler is an inline switch case that cannot be imported in isolation.

describe('live /api/chat weather path reports no reading', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  it('does not print a fabricated temperature or humidity in the weather case', () => {
    expect(serverSource).not.toContain('27°C');
    expect(serverSource).not.toContain('48%');
    expect(serverSource).not.toContain('temperatureC: 27');
    expect(serverSource).not.toContain('humidity: 48');
  });

  it('states that no weather source is connected', () => {
    expect(serverSource).toContain('कोई मौसम स्रोत कनेक्टेड नहीं है');
    expect(serverSource).toContain('No weather source is connected');
  });

  it('does not claim an action was executed for an unavailable reading', () => {
    const flat = serverSource.replace(/\s+/g, ' ');
    const weatherCase = flat.slice(
      flat.indexOf("case 'weather_inquiry': {"),
      flat.indexOf("case 'capabilities_inquiry': {"),
    );
    expect(weatherCase).toContain('actionExecuted = false;');
    expect(weatherCase).not.toContain('actionExecuted = true;');
  });

  it('GET /api/mobile/telemetry marks the weather snapshot unavailable', () => {
    const flat = serverSource.replace(/\s+/g, ' ');
    const telemetryRoute = flat.slice(
      flat.indexOf("app.get('/api/mobile/telemetry'"),
      flat.indexOf("app.post('/api/mobile/briefing/generate'"),
    );
    expect(telemetryRoute).toContain('available: false');
    expect(telemetryRoute).not.toContain('temperatureC: 27');
  });
});
