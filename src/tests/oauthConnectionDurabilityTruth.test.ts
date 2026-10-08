import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// Regression guard for a fake-success class on the social OAuth connect
// callbacks. Both GET /api/auth/linkedin/callback and
// GET /api/auth/youtube/callback stored the freshly-received credential, then
// discarded persistMemory()'s return value and rendered the "Connected!" popup
// unconditionally. On a read-only volume or full disk the credential never
// reached the memory file, so the popup announced a connection that the next
// boot does not have — and a VERIFIED "Connected" audit row was written for it.
// These tests pin the guard: a connection is only announced after the durable
// write succeeds; otherwise the credential is dropped and the popup posts an
// OAUTH_ERROR so the Social Media Hub is told the connection did not persist.
//
// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in oauthDisconnectTruth.test.ts.

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const serverFlat = serverSource.replace(/\s+/g, ' ');

/** Extracts one route handler's source up to the next app.<method> registration. */
function routeBlock(routePath: string): string {
  const start = serverFlat.indexOf(`'${routePath}'`);
  expect(start, `route ${routePath} should be registered`).toBeGreaterThanOrEqual(0);
  const next = serverFlat.indexOf('app.', start + routePath.length);
  return serverFlat.slice(start, next === -1 ? undefined : next);
}

const routes = [
  {
    path: '/api/auth/linkedin/callback',
    connectionField: 'linkedInConnection',
    errorType: 'LINKEDIN_OAUTH_ERROR',
    successMarker: 'LinkedIn Connected!',
  },
  {
    path: '/api/auth/youtube/callback',
    connectionField: 'youTubeConnection',
    errorType: 'YOUTUBE_OAUTH_ERROR',
    successMarker: 'YouTube Connected!',
  },
];

for (const route of routes) {
  it(`${route.path} only announces success after the connection is durable`, () => {
    const block = routeBlock(route.path);
    const persistCheckAt = block.indexOf('if (!persistMemory())');
    const auditAt = block.indexOf('addAuditLog(');
    const successAt = block.indexOf(route.successMarker);
    // The durability check must exist and gate both the audit row and the
    // success popup rendered to the user.
    expect(persistCheckAt).toBeGreaterThanOrEqual(0);
    expect(auditAt).toBeGreaterThan(persistCheckAt);
    expect(successAt).toBeGreaterThan(persistCheckAt);
  });

  it(`${route.path} rolls back the unpersisted credential and reports failure`, () => {
    const block = routeBlock(route.path);
    const persistCheckAt = block.indexOf('if (!persistMemory())');
    expect(persistCheckAt).toBeGreaterThanOrEqual(0);
    const failureBranch = block.slice(persistCheckAt, persistCheckAt + 1600);
    // The in-process state must match the durable file: drop the credential
    // that did not persist rather than keep a phantom connection.
    expect(failureBranch).toContain(`memoryState.${route.connectionField} = undefined;`);
    // The popup must tell the hub the connection failed, not render success.
    expect(failureBranch).toContain(route.errorType);
    expect(failureBranch).toContain('could not be written to durable storage');
    expect(failureBranch).not.toContain(route.successMarker);
  });
}
