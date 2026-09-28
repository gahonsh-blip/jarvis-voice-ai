import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  youtubeVoiceStatusReply,
  type YouTubeVoiceStatusFacts,
} from '../utils/hardening/youtubeVoiceStatusTruth';

// Regression guard for the `/api/chat` `youtube_status_inquiry` reply. It told
// the operator that a channel was "active, verified, and ready" and that the
// "OAuth 2.0 token status is nominal" whenever the local token lookup passed —
// even though that lookup never probes the channel and nothing measures quota.
// The seeded `jarvis_memory.json` in this repo carries a long-expired
// `expiresAt` with an encrypted token, which is exactly the shape that produced
// the false claim.

const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';

describe('youtubeVoiceStatusReply never claims an unobserved channel', () => {
  it('does not call a token-only connection verified or nominal', () => {
    const reply = youtubeVoiceStatusReply(
      { tokenValid: true, channelTitle: 'GAHONSH Freelancing', scopes: [UPLOAD_SCOPE] },
      false
    );
    expect(reply).not.toMatch(/verified/i);
    expect(reply).not.toMatch(/nominal/i);
    expect(reply).not.toMatch(/active, verified/i);
    expect(reply).not.toMatch(/ready/i);
  });

  it('never names a hardcoded placeholder channel', () => {
    const reply = youtubeVoiceStatusReply({ tokenValid: true }, false);
    expect(reply).not.toContain('Connected Channel');
  });

  it('says no channel has been read when the title is absent', () => {
    const reply = youtubeVoiceStatusReply({ tokenValid: true }, false);
    expect(reply).toMatch(/no channel has been read/i);
  });

  it('reports the real channel name when one is recorded', () => {
    const reply = youtubeVoiceStatusReply(
      { tokenValid: true, channelTitle: 'GAHONSH Freelancing' },
      false
    );
    expect(reply).toContain('GAHONSH Freelancing');
  });

  it('marks the upload grant confirmed only when the scope is on record', () => {
    const confirmed = youtubeVoiceStatusReply(
      { tokenValid: true, channelTitle: 'GAHONSH Freelancing', scopes: [UPLOAD_SCOPE] },
      false
    );
    expect(confirmed).toMatch(/Upload authorization: confirmed/i);

    const unrecorded = youtubeVoiceStatusReply(
      { tokenValid: true, channelTitle: 'GAHONSH Freelancing' },
      false
    );
    expect(unrecorded).toMatch(/Upload authorization: unknown/i);
    expect(unrecorded).not.toMatch(/Upload authorization: confirmed/i);

    const missing = youtubeVoiceStatusReply(
      { tokenValid: true, channelTitle: 'GAHONSH Freelancing', scopes: ['openid'] },
      false
    );
    expect(missing).toMatch(/Upload authorization: not confirmed/i);
  });

  it('tells the operator the connection is absent when the token is invalid', () => {
    const reply = youtubeVoiceStatusReply({ tokenValid: false }, false);
    expect(reply).toMatch(/not currently connected/i);
  });

  it('keeps the Hindi reply honest as well', () => {
    const reply = youtubeVoiceStatusReply(
      { tokenValid: true, channelTitle: 'GAHONSH Freelancing' } as YouTubeVoiceStatusFacts,
      true
    );
    expect(reply).not.toContain('सत्यापित');
    expect(reply).not.toContain('सामान्य');
    expect(reply).toMatch(/अज्ञात/);
  });
});

describe('the voice branch is wired to the truth helper', () => {
  const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

  it('uses youtubeVoiceStatusReply and no longer hardcodes the false claim', () => {
    expect(serverSource).toContain("from './src/utils/hardening/youtubeVoiceStatusTruth'");
    expect(serverSource).toContain('youtubeVoiceStatusReply(');
    expect(serverSource).not.toContain('is active, verified, and ready');
    expect(serverSource).not.toContain('token status is nominal');
    expect(serverSource).not.toContain('सक्रिय रूप से कनेक्टेड और सत्यापित है');
  });

  it('does not report an unverified channel as verified in the action payload', () => {
    const flat = serverSource.replace(/\s+/g, ' ');
    expect(flat).toContain('channelVerified: false');
  });
});
