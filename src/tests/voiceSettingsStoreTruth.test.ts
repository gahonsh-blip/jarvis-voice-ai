import { describe, it, expect } from 'vitest';
import {
  classifyVoiceSettingsWrite,
} from '../utils/hardening/voiceSettingsStoreTruth';

// Item 13 (Zero-fake-success). `saveLocalVoiceSettings` already returned whether
// the write reached `localStorage`, but the App's persist effect called it as a
// bare statement. A settings change that never reached storage therefore looked
// identical to a durable one and silently reverted on the next reload. The
// verdict is now classified into a notice the operator can act on.
describe('voice-settings durability verdict is classified, not discarded', () => {
  it('a landed write is silent', () => {
    expect(classifyVoiceSettingsWrite(true)).toEqual({ persisted: true, notice: '' });
  });

  it('a refused write names what was lost and states the reload revert', () => {
    const r = classifyVoiceSettingsWrite(false, 'Your voice settings');
    expect(r.persisted).toBe(false);
    expect(r.notice).toContain('Your voice settings');
    expect(r.notice).toContain('could NOT be saved to local storage');
    expect(r.notice).toContain('revert on reload');
  });

  it('an unobserved write is reported as unconfirmed, never as a save', () => {
    for (const unobserved of [null, undefined]) {
      const r = classifyVoiceSettingsWrite(unobserved, 'Your voice settings');
      expect(r.persisted).toBe(false);
      expect(r.notice).toContain('not confirmed saved');
      expect(r.notice).not.toContain('could NOT be saved');
    }
  });

  it('falls back to a generic target when the label is blank', () => {
    expect(classifyVoiceSettingsWrite(false, '   ').notice).toContain('Your voice settings');
  });
});

// Source guard. App.tsx is a large React component the suite does not mount, so
// the write site is pinned by reading the source, matching the approach the
// chat-history and offline-persistence suites already use.
describe('App.tsx no longer discards the voice-settings write verdict', () => {
  const fs = require('fs');
  const path = require('path');
  const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');

  it('imports the voice-settings classifier', () => {
    expect(appSource).toContain('classifyVoiceSettingsWrite');
    expect(appSource).toContain("from './utils/hardening/voiceSettingsStoreTruth'");
  });

  it('no bare discard of a voice-settings write remains', () => {
    // The pre-fix shape: `saveLocalVoiceSettings(...)` called as a statement
    // whose boolean was thrown away, on its own line with nothing capturing it.
    expect(appSource).not.toMatch(/\n\s*saveLocalVoiceSettings\([^)]*\);\n/);
  });

  it('the persist effect classifies the real verdict', () => {
    expect(appSource).toMatch(/classifyVoiceSettingsWrite\(saveLocalVoiceSettings\(voiceSettings\)\)/);
  });

  it('surfaces the refusal through the notice banner', () => {
    expect(appSource).toMatch(/voiceWrite\.notice[\s\S]{0,40}setMemorySaveNotice/);
  });
});
