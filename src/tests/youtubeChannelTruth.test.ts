import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  recordedChannelTitle,
  describeStagedChannel,
  CHANNEL_NOT_RECORDED_LABEL,
} from '../utils/hardening/youtubeChannelTruth';

// Item 13 ("zero fake success") — the staged YouTube upload draft displayed an
// invented target channel. Both draft routes in server.ts stored
// `memoryState.youTubeConnection?.channelTitle || 'Connected Channel'` / fell
// back to `'YouTube Channel'`, and SocialMediaModal.tsx rendered
// `targetChannel || 'Connected YouTube Channel'`. Nothing in those routes reads
// the channel, so a draft that had never seen one named a channel that was never
// observed.

const read = (rel: string) => fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
const squeezed = (rel: string) => read(rel).replace(/\s+/g, ' ');

describe('Item 13 — staged YouTube channel is never invented', () => {
  it('treats every historical placeholder name as not recorded', () => {
    expect(recordedChannelTitle('YouTube Channel')).toBeNull();
    expect(recordedChannelTitle('Connected Channel')).toBeNull();
    expect(recordedChannelTitle('Connected YouTube Channel')).toBeNull();
    // Whitespace / casing variants of the placeholders are still not real names.
    expect(recordedChannelTitle('  Connected Channel  ')).toBeNull();
  });

  it('treats blank and non-string values as not recorded', () => {
    expect(recordedChannelTitle('')).toBeNull();
    expect(recordedChannelTitle('   ')).toBeNull();
    expect(recordedChannelTitle(undefined)).toBeNull();
    expect(recordedChannelTitle(null)).toBeNull();
    expect(recordedChannelTitle(42)).toBeNull();
  });

  it('returns a real recorded channel title, trimmed', () => {
    expect(recordedChannelTitle('  JARVIS Labs  ')).toBe('JARVIS Labs');
    expect(recordedChannelTitle('OpenHands')).toBe('OpenHands');
  });

  it('describeStagedChannel says so when no channel was read, never a placeholder', () => {
    expect(describeStagedChannel(undefined)).toBe(CHANNEL_NOT_RECORDED_LABEL);
    expect(describeStagedChannel('YouTube Channel')).toBe(CHANNEL_NOT_RECORDED_LABEL);
    expect(describeStagedChannel('Connected YouTube Channel')).toBe(CHANNEL_NOT_RECORDED_LABEL);
    expect(describeStagedChannel('Real Channel')).toBe('Real Channel');
    // The label itself must not read as a channel name.
    expect(CHANNEL_NOT_RECORDED_LABEL).toMatch(/not recorded/i);
  });

  it('server.ts no longer stages an invented channel name', () => {
    const src = squeezed('server.ts');
    // The two draft routes staged `targetChannel: ... || 'YouTube Channel'`.
    expect(src).not.toContain("targetChannel: memoryState.youTubeConnection?.channelTitle || 'YouTube Channel'");
    // The audit rows named `|| 'Connected Channel'`.
    expect(src).not.toContain("target: `YouTube Channel: ${memoryState.youTubeConnection?.channelTitle || 'Connected Channel'}`");
    // Both draft routes now route through the shared helper.
    expect(src).toContain('recordedChannelTitle(memoryState.youTubeConnection?.channelTitle)');
    expect(src).toContain('describeStagedChannel(memoryState.youTubeConnection?.channelTitle)');
  });

  it('the Social Hub no longer renders an invented fallback channel', () => {
    const src = squeezed('src/components/SocialMediaModal.tsx');
    expect(src).not.toContain("'Connected YouTube Channel'");
    expect(src).toContain('describeStagedChannel(ytStagedPost.targetChannel)');
  });
});
