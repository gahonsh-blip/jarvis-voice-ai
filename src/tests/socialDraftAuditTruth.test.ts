import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  stagedDraftAuditEntry,
  claimsVerifiedOutcome,
} from '../utils/hardening/socialDraftAuditTruth';

// Regression guard for item 13. Three social routes logged their draft-staging
// event as `status: 'EXECUTED'` with `verificationStatus` / `finalTruthState`
// both `'VERIFIED'`, which the Security Matrix renders as a green confirmed
// badge. No external action occurred on those paths — they only wrote a local
// draft and staged a Level-4 approval request. server.ts binds a port on
// import, so the route assertions read the source text, matching
// mobileTelemetryTruth.test.ts and serverHealthTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

describe('stagedDraftAuditEntry never claims a verified outcome', () => {
  it('returns a pending, unverified truth triple for a staged draft', () => {
    const entry = stagedDraftAuditEntry({ platform: 'LinkedIn', topic: 'Launch', level: 2 });
    expect(entry.status).toBe('PENDING');
    expect(entry.verificationStatus).toBe('STANDBY');
    expect(entry.finalTruthState).toBe('DRAFT');
    expect(claimsVerifiedOutcome(entry)).toBe(false);
  });

  it('states plainly that no external action was performed', () => {
    const entry = stagedDraftAuditEntry({ platform: 'YouTube', topic: 'Demo', level: 4 });
    expect(entry.action).toContain('awaiting');
    expect(entry.action).toContain('no external action performed');
  });

  it('names the requested gate and defaults sensibly on blank input', () => {
    expect(stagedDraftAuditEntry({ platform: 'X', topic: 't', level: 4, gate: 'Level-4 authorization' }).action)
      .toContain('Level-4 authorization');
    const blank = stagedDraftAuditEntry({ platform: '  ', topic: '', level: NaN as unknown as number });
    expect(blank.action).toContain('Social');
    expect(blank.action).toContain('untitled');
    expect(claimsVerifiedOutcome(blank)).toBe(false);
  });
});

describe('social draft routes do not log unperformed work as executed', () => {
  const routeOf = (start: string, end: string) => flat.slice(flat.indexOf(start), flat.indexOf(end));

  it('POST /api/social/generate uses the truth builder, not an EXECUTED claim', () => {
    const route = routeOf("app.post('/api/social/generate'", "app.post('/api/social/action'");
    expect(route).toContain('stagedDraftAuditEntry(');
    expect(route).not.toContain("status: 'EXECUTED'");
    expect(route).not.toMatch(/verificationStatus: 'VERIFIED'/);
    expect(route).not.toMatch(/finalTruthState: 'VERIFIED'/);
  });

  it('POST /api/social/youtube/upload-draft uses the truth builder', () => {
    const route = routeOf("app.post('/api/social/youtube/upload-draft'", "app.post('/api/social/youtube/draft-test'");
    expect(route).toContain('stagedDraftAuditEntry(');
    expect(route).not.toContain("status: 'EXECUTED'");
    expect(route).not.toMatch(/finalTruthState: 'VERIFIED'/);
  });

  it('POST /api/social/youtube/draft-test uses the truth builder', () => {
    const route = routeOf("app.post('/api/social/youtube/draft-test'", "app.post('/api/social/youtube/update-draft'");
    expect(route).toContain('stagedDraftAuditEntry(');
    expect(route).not.toContain("status: 'EXECUTED'");
    expect(route).not.toMatch(/finalTruthState: 'VERIFIED'/);
  });
});
