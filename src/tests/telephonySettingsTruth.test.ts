import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  classifyTelephonySettingsUpdate,
  TELEPHONY_SETTING_KEYS,
} from '../utils/hardening/telephonySettingsTruth';

// Regression guard for backlog item 13. `POST /api/telephony/settings`
// answered `success: true` for every request, spreading any caller-supplied
// object over the live settings: an unknown key was "stored", a malformed
// value corrupted state, and a body carrying no real setting still reported a
// save. server.ts binds a port on import, so the wiring is asserted against the
// source text and the decision logic is exercised directly, matching
// freelanceLeadStatusTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const modalSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/TelephonyHubModal.tsx'),
  'utf8'
);

const current = {
  provider: 'browser_webrtc_simulator',
  autoAnswerInbound: true,
  voiceRate: 1.05,
  aiReceptionistGreeting: 'Hello',
};

describe('classifyTelephonySettingsUpdate only stores real settings', () => {
  it('applies a recognised setting that differs from the stored value', () => {
    const verdict = classifyTelephonySettingsUpdate({ autoAnswerInbound: false }, current);
    expect(verdict.accepted).toBe(true);
    if (verdict.accepted) {
      expect(verdict.applied).toEqual({ autoAnswerInbound: false });
      expect(verdict.changed).toBe(true);
    }
  });

  it('reports a repeat of the stored value as stored-but-unchanged', () => {
    const verdict = classifyTelephonySettingsUpdate({ autoAnswerInbound: true }, current);
    expect(verdict.accepted).toBe(true);
    if (verdict.accepted) {
      expect(verdict.changed).toBe(false);
      expect(verdict.message).toContain('none differed');
    }
  });

  it('accepts every real setting key', () => {
    for (const key of TELEPHONY_SETTING_KEYS) {
      const value = key === 'autoAnswerInbound' ? false : 'probe-value';
      const verdict = classifyTelephonySettingsUpdate({ [key]: value }, {});
      expect(verdict.accepted).toBe(true);
    }
  });

  it('refuses a body that names no setting', () => {
    for (const empty of [{}, null, undefined, [], 'provider']) {
      const verdict = classifyTelephonySettingsUpdate(empty, current);
      expect(verdict.accepted).toBe(false);
      if (!verdict.accepted) expect(verdict.reason).toBe('NO_KEYS');
    }
  });

  it('refuses a body made only of unknown keys instead of storing them', () => {
    const verdict = classifyTelephonySettingsUpdate({ providerr: 'twilio', nope: 1 }, current);
    expect(verdict.accepted).toBe(false);
    if (!verdict.accepted) {
      expect(verdict.reason).toBe('NO_RECOGNISED_KEYS');
      expect(verdict.rejected).toEqual(['providerr', 'nope']);
    }
  });

  it('rejects a malformed value rather than writing it into live settings', () => {
    const verdict = classifyTelephonySettingsUpdate(
      { autoAnswerInbound: { evil: true }, voiceRate: [1, 2] },
      current
    );
    expect(verdict.accepted).toBe(false);
    if (!verdict.accepted) {
      expect(verdict.reason).toBe('NO_RECOGNISED_KEYS');
      expect(verdict.rejected).toEqual(['autoAnswerInbound', 'voiceRate']);
    }
  });

  it('rejects a null value that would erase a setting', () => {
    const verdict = classifyTelephonySettingsUpdate({ provider: null }, current);
    expect(verdict.accepted).toBe(false);
    if (!verdict.accepted) expect(verdict.rejected).toEqual(['provider']);
  });

  it('applies the real keys and rejects the bad ones in a mixed body', () => {
    const verdict = classifyTelephonySettingsUpdate(
      { autoAnswerInbound: false, bogus: 'x', voiceRate: [1] },
      current
    );
    expect(verdict.accepted).toBe(true);
    if (verdict.accepted) {
      expect(verdict.applied).toEqual({ autoAnswerInbound: false });
      expect(verdict.rejected).toEqual(['bogus', 'voiceRate']);
      expect(verdict.changed).toBe(true);
    }
  });
});

describe('the telephony settings route no longer fakes a save', () => {
  const route = (() => {
    const start = serverSource.indexOf("app.post('/api/telephony/settings'");
    return serverSource.slice(start, serverSource.indexOf('// 5. Autonomous Voice Call Turn Processing', start));
  })();

  it('classifies the update before storing it', () => {
    expect(route).toContain('classifyTelephonySettingsUpdate(');
    expect(route).toMatch(/success:\s*false/);
  });

  it('no longer spreads the raw request body over the live settings', () => {
    expect(route).not.toMatch(/\.\.\.updates/);
  });

  it('surfaces the change verdict so the UI cannot claim a save that did not happen', () => {
    expect(route).toContain('changed: verdict.changed');
    expect(modalSource).toContain('data.changed === false');
  });
});
