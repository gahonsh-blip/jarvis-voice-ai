// ==============================================================================
// LinkedIn status truth guard (backlog item 13).
//
// Regression: GET /api/auth/linkedin/status answered `connected: true` for a
// static LINKEDIN_ACCESS_TOKEN straight from the environment. Nothing had
// probed that token against LinkedIn, yet the endpoint — which is also consumed
// by the offline/online e2e "an unconfigured integration must not report a live
// connection" contract — presented an unmeasured credential as a live account.
// The canonical /api/social/platforms card already labelled the same token
// CONFIGURED; this endpoint contradicted the one surface the UI trusts.
// ==============================================================================
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

/** The `/api/auth/linkedin/status` handler body, bounded at the next route. */
function linkedInStatusBlock(): string {
  const start = serverSource.indexOf("app.get('/api/auth/linkedin/status'");
  expect(start, 'linkedin status route missing').toBeGreaterThan(-1);
  const rest = serverSource.slice(start);
  const next = /\napp\.(get|post)\(/.exec(rest.slice(1));
  const end = next ? start + 1 + next.index : serverSource.length;
  return serverSource.slice(start, end).replace(/\s+/g, ' ');
}

describe('a static LinkedIn env token is configured, not a live connection', () => {
  const block = linkedInStatusBlock();

  it('never answers connected: true from the static-token branch', () => {
    // Bound only the static-token branch so the OAuth-connected branch (which
    // does make a real userinfo probe) is allowed to answer connected: true.
    const staticStart = block.indexOf('if (staticToken)');
    expect(staticStart, 'static token branch missing').toBeGreaterThan(-1);
    const branch = block.slice(staticStart, staticStart + 600);
    expect(branch).not.toContain('connected: true');
    expect(branch).toContain('connected: false');
    expect(branch).toContain("status: 'CONFIGURED'");
    expect(branch).toContain("authType: 'STATIC_ENV_TOKEN'");
    expect(branch).toMatch(/has not been verified against LinkedIn/i);
  });

  it('still reports a real OAuth connection as connected', () => {
    // Guard against over-broadening: the branch that runs an authenticated
    // userinfo probe keeps its `connected: true`.
    const oauthAt = block.indexOf('memoryState.linkedInConnection && memoryState.linkedInConnection.connected');
    expect(oauthAt, 'OAuth connected guard missing').toBeGreaterThan(-1);
    const oauthBranch = block.slice(oauthAt, oauthAt + 300);
    expect(oauthBranch).toContain('connected: true');
  });

  it('does not expose the static token through the response', () => {
    // The static branch must not echo the token itself; only its presence.
    const staticStart = block.indexOf('if (staticToken)');
    const branch = block.slice(staticStart, staticStart + 600);
    expect(branch).not.toContain('token: staticToken');
    expect(branch).not.toContain('accessToken: staticToken');
  });
});
