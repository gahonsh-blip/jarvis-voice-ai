import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Regression guard for a fake-success class on the social OAuth disconnect
// routes. Both POST /api/auth/linkedin/disconnect and
// POST /api/auth/youtube/disconnect answered `success: true` unconditionally,
// even when no account was linked, so the Social Media Hub announced a
// disconnection that removed no credential. These tests pin the guard: a
// disconnect only reports success after confirming something was connected,
// and the not-connected path reports failure without writing a "Disconnected"
// audit row.
//
// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in telephonyDispatchTruth.test.ts.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

const modalSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/SocialMediaModal.tsx'),
  'utf8'
);
const modalFlat = modalSource.replace(/\s+/g, ' ');

/** Extracts one route handler's source up to the next app.<method> registration. */
function routeBlock(routePath: string): string {
  const start = serverFlat.indexOf(`'${routePath}'`);
  expect(start, `route ${routePath} should be registered`).toBeGreaterThanOrEqual(0);
  const next = serverFlat.indexOf('app.', start + routePath.length);
  const block = serverFlat.slice(start, next === -1 ? undefined : next);
  return block;
}

describe('social OAuth disconnect reports the real connection state', () => {
  it('LinkedIn disconnect guards on an existing connection before success', () => {
    const block = routeBlock('/api/auth/linkedin/disconnect');
    const guardAt = block.indexOf('if (!memoryState.linkedInConnection)');
    const successAt = block.indexOf("success: true");
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(successAt).toBeGreaterThan(guardAt);
    expect(block).toContain("outcome: 'NOT_CONNECTED'");
    expect(block).toContain('success: false');
  });

  it('YouTube disconnect guards on an existing connection before success', () => {
    const block = routeBlock('/api/auth/youtube/disconnect');
    const guardAt = block.indexOf('if (!memoryState.youTubeConnection)');
    const successAt = block.indexOf("success: true");
    expect(guardAt).toBeGreaterThanOrEqual(0);
    expect(successAt).toBeGreaterThan(guardAt);
    expect(block).toContain("outcome: 'NOT_CONNECTED'");
    expect(block).toContain('success: false');
  });

  it('never writes a "Disconnected" audit row on the not-connected path', () => {
    for (const route of ['/api/auth/linkedin/disconnect', '/api/auth/youtube/disconnect']) {
      const block = routeBlock(route);
      const guardAt = block.indexOf('NOT_CONNECTED');
      const auditAt = block.indexOf('Disconnected (');
      // The early not-connected return must precede the audit write, so an
      // idle disconnect cannot log a credential removal it never performed.
      expect(guardAt).toBeGreaterThanOrEqual(0);
      expect(auditAt).toBeGreaterThan(guardAt);
    }
  });

  it('the Social Media Hub surfaces the not-connected outcome instead of a success notice', () => {
    // Each handler must have an else branch that renders the server's message,
    // so the UI never shows "disconnected" when nothing was disconnected.
    const linkedinHandler = modalFlat.slice(
      modalFlat.indexOf('const handleDisconnectLinkedIn'),
      modalFlat.indexOf('const handleConnectYouTube')
    );
    expect(linkedinHandler).toContain('} else {');
    expect(linkedinHandler).toContain('data.message');

    const youtubeHandler = modalFlat.slice(
      modalFlat.indexOf('const handleDisconnectYouTube'),
      modalFlat.indexOf('const handleCopyRedirectUri')
    );
    expect(youtubeHandler).toContain('} else {');
    expect(youtubeHandler).toContain('data.message');
  });
});
