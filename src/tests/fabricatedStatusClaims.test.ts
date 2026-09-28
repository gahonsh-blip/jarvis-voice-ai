import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  fnv1a32Hex,
  payloadChecksumLine,
  cronSchedulerLabel,
  telegramPushLabel,
} from '../utils/checksumTruth';

// Regression guard for fabricated status claims in the UI. Each string below
// was rendered unconditionally, so it asserted a state (hash-verified payload,
// ready Telegram push, active remote scheduler, fully complete architecture)
// that no code path in this process ever measured.

const COMPONENT_DIR = path.resolve(__dirname, '../components');
const read = (file: string) => fs.readFileSync(path.join(COMPONENT_DIR, file), 'utf8');

describe('checksumTruth helpers never overstate integrity or liveness', () => {
  it('produces a stable, deterministic 8-hex-char hash', () => {
    expect(fnv1a32Hex('hello')).toBe('4f9f2cab');
    expect(fnv1a32Hex('hello')).toBe(fnv1a32Hex('hello'));
    expect(fnv1a32Hex('hello')).not.toBe(fnv1a32Hex('hello!'));
    expect(fnv1a32Hex('')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('labels the payload checksum honestly and refuses to claim SHA-2', () => {
    const line = payloadChecksumLine('deploy to prod');
    expect(line).toContain('FNV-1a32');
    expect(line).toContain('not SHA-2');
    expect(line).not.toMatch(/verified/i);
    expect(line).not.toContain('SHA-Safe');
  });

  it('reports an empty payload as having no checksum instead of a green tick', () => {
    expect(payloadChecksumLine('')).toContain('NONE');
    expect(payloadChecksumLine(null)).toContain('NONE');
    expect(payloadChecksumLine(undefined)).toContain('NONE');
  });

  it('cron label is UNKNOWN until the status endpoint has answered', () => {
    expect(cronSchedulerLabel(false, undefined)).toContain('UNKNOWN');
    expect(cronSchedulerLabel(false, true)).toContain('UNKNOWN');
    expect(cronSchedulerLabel(true, true)).toBe('Cron Scheduler: running');
    expect(cronSchedulerLabel(true, false)).toBe('Cron Scheduler: not running');
  });

  it('telegram label is UNKNOWN until the status endpoint has answered', () => {
    expect(telegramPushLabel(false, undefined)).toContain('UNKNOWN');
    expect(telegramPushLabel(false, true)).toContain('UNKNOWN');
    expect(telegramPushLabel(true, true)).toContain('live-connected');
    expect(telegramPushLabel(true, false)).toContain('NOT CONNECTED');
  });
});

describe('components do not print hardcoded success claims', () => {
  it('PermissionGateway renders a computed checksum, not a fixed SHA-Safe badge', () => {
    const src = read('PermissionGateway.tsx');
    expect(src).not.toContain('Verified SHA-Safe');
    expect(src).toContain('payloadChecksumLine');
  });

  it('ProactiveRoutinesModal derives push and scheduler status from live endpoints', () => {
    const src = read('ProactiveRoutinesModal.tsx');
    expect(src).not.toContain('Telegram Push Ready');
    expect(src).not.toContain('Cron Scheduler: Active');
    expect(src).toContain('/api/telegram/status');
    expect(src).toContain('/api/daemon/status');
  });

  it('BlueprintRoadmapModal does not seed a 100% completion state before fetching', () => {
    const src = read('BlueprintRoadmapModal.tsx');
    expect(src).not.toContain('100% Free Architecture Verified');
    expect(src).not.toMatch(/completionPercentage:\s*100/);
    expect(src).toMatch(/completionPercentage:\s*0/);
  });
});