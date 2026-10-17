import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import type { MemoryStore } from '../types';
import {
  youtubeOfflineStatusReply,
  offlineTokenFreshness,
} from '../utils/hardening/youtubeVoiceStatusTruth';

// Regression guard for the offline (`processOfflineCommand`) YouTube status
// branch. It answered every stored connection with "connected and verified",
// "API status verified", a "ready" Level-4 pipeline, and — when no channel had
// ever been read — the hardcoded name 'Connected Channel'. The offline engine
// makes no provider call, so none of those claims were observed. A second
// defect lived in the language router: `'hinglish'.startsWith('hi')` is true,
// so the Hinglish branch was dead code and a Hinglish request was answered in
// Devanagari.

const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

function memory(overrides: Partial<MemoryStore['youTubeConnection']> = {}): MemoryStore {
  return {
    name: 'Gahonsh',
    youTubeConnection: {
      connected: true,
      channelId: 'UChdG0AL8NdFtGHzNY-C6XnQ',
      channelTitle: 'GAHONSH Freelancing',
      ...overrides,
    },
    notes: [],
    customKeyValues: {},
    stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '2026-09-01T00:00:00.000Z' },
  };
}

describe('offline YouTube status never claims an unobserved verification', () => {
  it('does not say connected-and-verified, API verified, or ready', () => {
    const r = processOfflineCommand('youtube status', memory(), 'en-US');
    expect(r.intent).toBe('youtube_status_inquiry');
    expect(r.reply).not.toMatch(/connected and verified/i);
    expect(r.reply).not.toMatch(/API verified/i);
    expect(r.reply).not.toMatch(/ready/i);
    expect(r.reply).not.toMatch(/Level-4/i);
    expect(r.reply).toMatch(/not verified in this slot/i);
  });

  it('never names the hardcoded placeholder channel', () => {
    const r = processOfflineCommand(
      'youtube status',
      memory({ channelTitle: undefined }),
      'en-US'
    );
    expect(r.reply).not.toContain('Connected Channel');
    expect(r.reply).toMatch(/no channel has been read yet/i);
  });

  it('keeps the Hindi reply free of the false verification words', () => {
    const r = processOfflineCommand('youtube status', memory(), 'hi-IN');
    // The honest reply contains the *negated* form ("सत्यापित नहीं किया गया"),
    // so assert on the affirmative claims the old branch made instead.
    expect(r.reply).not.toContain('सफलतापूर्वक');
    expect(r.reply).not.toContain('सत्यापित है');
    expect(r.reply).not.toContain('तैयार है');
    expect(r.reply).toMatch(/सत्यापित नहीं किया गया/);
  });

  it('answers a Hinglish request in Hinglish, not Devanagari', () => {
    const r = processOfflineCommand('youtube status', memory(), 'hinglish');
    expect(r.reply).toContain('Sir,');
    expect(r.reply).toContain('offline memory mein record hai');
    expect(r.reply).not.toMatch(/[\u0900-\u097F]/);
  });

  it('reports the not-connected case without inventing a channel', () => {
    const r = processOfflineCommand(
      'youtube status',
      { ...memory(), youTubeConnection: { connected: false } },
      'en-US'
    );
    expect(r.reply).toMatch(/not connected/i);
    expect(r.actionDetail?.title).toBe('YouTube Status: Not Connected');
  });

  it('carries channelVerified: false in the action payload', () => {
    const r = processOfflineCommand('youtube status', memory(), 'en-US');
    const payload = r.actionDetail?.payload as Record<string, unknown> | undefined;
    expect(payload?.channelVerified).toBe(false);
    expect(payload?.connected).toBe(true);
  });
});

describe('offlineTokenFreshness reads absence as unknown, never as valid', () => {
  const now = new Date('2026-09-25T18:00:00.000Z');

  it('classifies a past expiry as expired', () => {
    expect(offlineTokenFreshness('2026-09-02T18:42:59.504Z', now)).toBe('expired');
  });

  it('classifies a future expiry as fresh', () => {
    expect(offlineTokenFreshness('2026-10-02T18:42:59.504Z', now)).toBe('fresh');
  });

  it('classifies a missing or unparseable expiry as unknown', () => {
    expect(offlineTokenFreshness(undefined, now)).toBe('unknown');
    expect(offlineTokenFreshness(null, now)).toBe('unknown');
    expect(offlineTokenFreshness('not-a-date', now)).toBe('unknown');
  });

  it('warns that an expired credential must be reconnected', () => {
    const reply = youtubeOfflineStatusReply(
      {
        connected: true,
        channelTitle: 'GAHONSH Freelancing',
        expiresAt: '2026-09-02T18:42:59.504Z',
        scopes: [UPLOAD_SCOPE],
        now,
      },
      'en'
    );
    expect(reply).toMatch(/expiry on record has already passed/i);
    expect(reply).toMatch(/An upload scope is on record/i);
  });

  it('reports an unrecorded scope grant as unknown, not as granted', () => {
    const reply = youtubeOfflineStatusReply(
      { connected: true, channelTitle: 'GAHONSH Freelancing', now },
      'en'
    );
    expect(reply).toMatch(/upload grant is unknown/i);
    expect(reply).not.toMatch(/An upload scope is on record/i);
  });
});

describe('the offline engine is wired to the truth helper', () => {
  const engineSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/utils/localJarvisEngine.ts'),
    'utf8'
  );

  it('uses youtubeOfflineStatusReply and drops the false claims', () => {
    expect(engineSource).toContain('youtubeOfflineStatusReply(');
    expect(engineSource).not.toContain('connected and verified');
    expect(engineSource).not.toContain('API status verified');
    expect(engineSource).not.toContain("|| 'Connected Channel'");
    expect(engineSource).not.toContain('Level-4 authorization enforcement');
  });

  it('routes hinglish before the hi prefix match', () => {
    const flat = engineSource.replace(/\s+/g, ' ');
    const hinglishAt = flat.indexOf("language === 'hinglish'");
    const hiPrefixAt = flat.indexOf("language.startsWith('hi')");
    expect(hinglishAt).toBeGreaterThan(-1);
    expect(hiPrefixAt).toBeGreaterThan(-1);
    expect(hinglishAt).toBeLessThan(hiPrefixAt);
  });
});
