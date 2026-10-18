import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  githubStatusBadge,
  githubStatusMessage,
  githubStatusTone,
  GITHUB_STATUS_UNKNOWN_LABEL,
} from '../utils/hardening/githubStatusDisplayTruth';

// Item 13 ("zero fake success"). The Tools HUD seeded `githubStatus` to `null`
// and rendered the badge/status line straight from it. Before the status
// endpoint answered — or after a non-OK response / network error, which
// `fetchGithubData` swallowed in a bare `catch` — the banner read
// `NOT CONNECTED` and `Inspecting GitHub connection...` from a value nobody had
// observed. These cases pin the honest labels and forbid a return to the raw
// render.

const source = (rel: string) =>
  fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');

describe('Item 13 — the GitHub banner names only an observed connection state', () => {
  it('reads STATUS UNKNOWN until the status endpoint has answered', () => {
    expect(githubStatusBadge(false, undefined)).toBe('STATUS UNKNOWN');
    // Even a stale `true` cannot render before the probe answered.
    expect(githubStatusBadge(false, true)).toBe('STATUS UNKNOWN');
    expect(githubStatusTone(false, false)).toBe('unknown');
  });

  it('renders AUTHENTICATED / NOT CONNECTED only from an observed boolean', () => {
    expect(githubStatusBadge(true, true)).toBe('AUTHENTICATED');
    expect(githubStatusBadge(true, false)).toBe('NOT CONNECTED');
    expect(githubStatusTone(true, true)).toBe('connected');
    expect(githubStatusTone(true, false)).toBe('disconnected');
  });

  it('an observed response without a boolean connection state is UNKNOWN', () => {
    expect(githubStatusBadge(true, undefined)).toBe('STATUS UNKNOWN');
    expect(githubStatusBadge(true, 'yes')).toBe('STATUS UNKNOWN');
    expect(githubStatusTone(true, null)).toBe('unknown');
  });

  it('the status line never shows the pre-fetch "Inspecting" placeholder', () => {
    const unknown = githubStatusMessage(undefined, false);
    expect(unknown).toBe(GITHUB_STATUS_UNKNOWN_LABEL);
    expect(unknown).not.toContain('Inspecting');
    expect(githubStatusMessage('Authenticated as GitHub user: @x', true)).toBe(
      'Authenticated as GitHub user: @x'
    );
    // An observed-but-empty message must not render blank.
    expect(githubStatusMessage('', true).trim().length).toBeGreaterThan(0);
  });

  it('the modal routes the banner through the helpers (source guard)', () => {
    const modal = source('src/components/AutonomousToolsModal.tsx');
    expect(modal).toContain('githubStatusBadge(githubStatusObserved');
    expect(modal).toContain('githubStatusMessage(githubStatus?.message, githubStatusObserved)');
    expect(modal).toContain('githubStatusTone(githubStatusObserved');
    // The pre-fix renders must be gone.
    expect(modal).not.toContain("'AUTHENTICATED' : 'NOT CONNECTED'");
    expect(modal).not.toContain('Inspecting GitHub connection...');
    // The status fetch must record whether the endpoint actually answered.
    expect(modal).toContain('setGithubStatusObserved(true)');
    expect(modal).toContain('setGithubStatusObserved(false)');
  });
});
