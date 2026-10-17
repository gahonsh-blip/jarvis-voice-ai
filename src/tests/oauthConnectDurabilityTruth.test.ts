// ==============================================================================
// Backlog item 13 — "zero fake success".
//
// Both OAuth connect callbacks persist the credential with `persistMemory()`,
// drop the credential when that write fails, and then append a `VERIFIED`
// security audit row through `addAuditLog()`. `addAuditLog` routes through
// `recordDurableAuditRow`, which returns false when the row never reached
// `jarvis_memory.json` — but both callbacks discarded that boolean and rendered
// their green "Connected!" card anyway. An operator could therefore believe the
// connection was recorded in the security log while the row lived only in
// process memory and vanished on the next boot.
//
// The callbacks now capture the boolean and render `oauthConnectAuditNote(...)`,
// which names the one thing that did not land without turning a real connection
// into a failure. Source guards pin the wiring so a future edit cannot quietly
// drop it again.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { oauthConnectAuditNote } from '../utils/hardening/oauthConnectDurabilityTruth';

const flatten = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8').replace(/\s+/g, ' ');

describe('oauthConnectAuditNote', () => {
  it('renders nothing when the audit row is on disk', () => {
    expect(oauthConnectAuditNote('linkedin', true)).toBe('');
    expect(oauthConnectAuditNote('youtube', true)).toBe('');
  });

  it('names the unrecorded audit row for LinkedIn without claiming the connection failed', () => {
    const note = oauthConnectAuditNote('linkedin', false);
    expect(note).toContain('LinkedIn');
    expect(note).toContain('audit');
    expect(note).toContain('durable storage');
    // The connection itself is real: the note must not read as a failure.
    expect(note).not.toMatch(/not connected/i);
    expect(note).not.toMatch(/failed to connect/i);
    expect(note).toContain('connection is real');
    expect(note).toContain('absent after a restart');
  });

  it('names the unrecorded audit row for YouTube without claiming the connection failed', () => {
    const note = oauthConnectAuditNote('youtube', false);
    expect(note).toContain('YouTube');
    expect(note).toContain('audit');
    expect(note).toContain('durable storage');
    expect(note).not.toMatch(/not connected/i);
    expect(note).not.toMatch(/failed to connect/i);
    expect(note).toContain('connection is real');
  });

  it('labels each platform distinctly', () => {
    expect(oauthConnectAuditNote('linkedin', false)).not.toBe(
      oauthConnectAuditNote('youtube', false)
    );
  });
});

describe('OAuth connect route wiring', () => {
  const server = flatten('server.ts');

  it('imports the audit-durability note helper', () => {
    expect(server).toContain(
      "import { oauthConnectAuditNote } from './src/utils/hardening/oauthConnectDurabilityTruth';"
    );
  });

  it('captures the audit boolean for both connect callbacks', () => {
    expect(server).toContain('const linkedInAuditRecorded = addAuditLog(');
    expect(server).toContain('const youTubeAuditRecorded = addAuditLog(');
    expect(server).toContain("oauthConnectAuditNote('linkedin', linkedInAuditRecorded)");
    expect(server).toContain("oauthConnectAuditNote('youtube', youTubeAuditRecorded)");
  });

  it('renders the note in both success cards', () => {
    expect(server).toContain('${linkedInAuditNote ?');
    expect(server).toContain('${youTubeAuditNote ?');
  });

  it('still gates the stored credential on the durable write before auditing', () => {
    // The audit note only makes sense when the connection itself is durable.
    expect(server).toContain('if (!persistMemory()) {');
    expect(server).toContain('memoryState.linkedInConnection = undefined;');
    expect(server).toContain('memoryState.youTubeConnection = undefined;');
  });
});
