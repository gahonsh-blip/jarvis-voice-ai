import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  TELEPHONY_TWIML_TURN_PATH,
  REGISTERED_TELEPHONY_ENDPOINTS,
  NONEXISTENT_TWIML_VOICE_PATH,
  telephonyEndpointRegistered,
  telephonyEndpointLabel,
  telephonyBrainLabel,
} from '../utils/telephonyEndpointTruth';

// Regression guard for the Telephony Hub endpoint panel.
//
// The panel advertised POST /api/telephony/twiml/voice as "TwiML ACTIVE" and
// the Twilio adapter used the same path as its post-answer callback, but
// server.ts never registers that route — a carrier following it would 404.
// Every badge was also hardcoded green. These tests pin both fixes and, most
// importantly, check the invariant that matters: every advertised endpoint is
// one the server actually registers.

const SRC_DIR = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(SRC_DIR, '..');
const readSrc = (rel: string) => fs.readFileSync(path.join(SRC_DIR, rel), 'utf8');

const serverSource = fs.readFileSync(path.join(REPO_ROOT, 'server.ts'), 'utf8');

describe('telephony endpoint truth helpers', () => {
  it('recognises only routes the server registers', () => {
    for (const endpoint of REGISTERED_TELEPHONY_ENDPOINTS) {
      expect(telephonyEndpointRegistered(endpoint)).toBe(true);
    }
    expect(telephonyEndpointRegistered(NONEXISTENT_TWIML_VOICE_PATH)).toBe(false);
  });

  it('labels an unregistered endpoint as having no such route', () => {
    expect(telephonyEndpointLabel(NONEXISTENT_TWIML_VOICE_PATH, true)).toBe('NO SUCH ROUTE');
  });

  it('holds readiness at UNKNOWN until the status request answers', () => {
    const label = telephonyEndpointLabel('/api/telephony/incoming', false);
    expect(label).toContain('UNKNOWN');
    expect(label).not.toMatch(/READY|ACTIVE|LIVE/);
  });

  it('never claims the Gemini brain is ready without an observed API key', () => {
    expect(telephonyBrainLabel(undefined, undefined)).toContain('UNKNOWN');
    expect(telephonyBrainLabel(true, undefined)).toContain('UNKNOWN');
    expect(telephonyBrainLabel(true, false)).toContain('OFFLINE ENGINE');
    expect(telephonyBrainLabel(true, false)).not.toMatch(/READY/);
    expect(telephonyBrainLabel(false, true)).toContain('GATEWAY NOT CONFIGURED');
  });
});

describe('the server registers every endpoint the UI advertises', () => {
  it('registers each advertised telephony route', () => {
    for (const endpoint of REGISTERED_TELEPHONY_ENDPOINTS) {
      expect(serverSource).toContain(`app.post('${endpoint}'`);
    }
  });

  it('does not register the route the UI used to advertise', () => {
    expect(serverSource).not.toContain(`'${NONEXISTENT_TWIML_VOICE_PATH}'`);
  });

  it('answers /api/health with a measured geminiEnabled flag', () => {
    expect(serverSource).toContain('geminiEnabled: Boolean(process.env.GEMINI_API_KEY)');
  });
});

describe('the UI and adapters stop overstating telephony status', () => {
  it('TelephonyHubModal no longer advertises the non-existent TwiML route', () => {
    const src = readSrc('components/TelephonyHubModal.tsx');
    expect(src).not.toContain(NONEXISTENT_TWIML_VOICE_PATH);
    expect(src).toContain(TELEPHONY_TWIML_TURN_PATH);
  });

  it('TelephonyHubModal drops the hardcoded green badges', () => {
    const src = readSrc('components/TelephonyHubModal.tsx');
    expect(src).not.toContain('LIVE & READY');
    expect(src).not.toContain('TwiML ACTIVE');
    expect(src).not.toContain('GEMINI BRAIN READY');
    expect(src).toContain('telephonyEndpointLabel');
    expect(src).toContain('telephonyBrainLabel');
  });

  it('the Twilio adapter points its callback at a registered route', () => {
    const src = readSrc('utils/telephonyAdapters.ts');
    expect(src).not.toContain(NONEXISTENT_TWIML_VOICE_PATH);
    expect(src).toContain('TELEPHONY_TWIML_TURN_PATH');
  });

  it('BlueprintRoadmapModal stops asserting a Security Matrix it never queried', () => {
    const src = readSrc('components/BlueprintRoadmapModal.tsx');
    expect(src).not.toContain('Security Matrix: Active');
  });
});
