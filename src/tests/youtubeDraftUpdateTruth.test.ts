import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { classifyYouTubeDraftUpdate } from '../utils/hardening/youtubeDraftUpdateTruth';

// Regression guard for backlog item 13. `POST /api/social/youtube/update-draft`
// answered `{ success: true, post }` for every request that matched a staged
// post, even when nothing was applied — the Social Hub announced "YouTube video
// parameters updated." for a repeat submission. server.ts binds a port on
// import, so the route wiring is asserted against the source text and the
// decision logic is exercised directly, matching freelanceLeadStatusTruth.test.ts.
const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');

describe('classifyYouTubeDraftUpdate only applies a real difference', () => {
  it('applies a changed title, description and privacy together', () => {
    const verdict = classifyYouTubeDraftUpdate(
      { title: '  New Title  ', description: 'New body', privacyStatus: 'public' },
      { videoTitle: 'Old Title', videoDescription: 'Old body', privacyStatus: 'private' }
    );
    expect(verdict.success).toBe(true);
    expect(verdict.outcome).toBe('APPLIED');
    expect(verdict.changes).toEqual({
      videoTitle: 'New Title',
      videoDescription: 'New body',
      privacyStatus: 'public',
    });
  });

  it('reports a repeat submission as a no-op, not a saved update', () => {
    const verdict = classifyYouTubeDraftUpdate(
      { title: 'Same', description: 'Same body', privacyStatus: 'private' },
      { videoTitle: 'Same', videoDescription: 'Same body', privacyStatus: 'private' }
    );
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('UNCHANGED');
    expect(verdict.changes).toEqual({});
  });

  it('treats an unrecognised privacy value as the stored private default, not a change', () => {
    const verdict = classifyYouTubeDraftUpdate(
      { privacyStatus: 'bogus' },
      { videoTitle: 'T', videoDescription: 'D', privacyStatus: 'private' }
    );
    expect(verdict.success).toBe(false);
    expect(verdict.changes).toEqual({});
  });

  it('applies only the field that actually changed', () => {
    const verdict = classifyYouTubeDraftUpdate(
      { title: 'Same', privacyStatus: 'unlisted' },
      { videoTitle: 'Same', videoDescription: 'Body', privacyStatus: 'private' }
    );
    expect(verdict.success).toBe(true);
    expect(verdict.changes).toEqual({ privacyStatus: 'unlisted' });
  });

  it('ignores a blank title and a non-string description', () => {
    const verdict = classifyYouTubeDraftUpdate(
      { title: '   ', description: 42 },
      { videoTitle: 'Keep', videoDescription: 'Body', privacyStatus: 'private' }
    );
    expect(verdict.success).toBe(false);
    expect(verdict.changes).toEqual({});
  });

  it('refuses an empty request rather than reporting an update', () => {
    const verdict = classifyYouTubeDraftUpdate({}, { videoTitle: 'T', videoDescription: 'D', privacyStatus: 'private' });
    expect(verdict.success).toBe(false);
    expect(verdict.outcome).toBe('UNCHANGED');
  });
});

describe('the update-draft route no longer fakes a saved update', () => {
  const route = (() => {
    const start = serverSource.indexOf("app.post('/api/social/youtube/update-draft'");
    return serverSource.slice(start, serverSource.indexOf('// Helper to determine canonical LinkedIn OAuth Redirect URI', start));
  })();

  it('classifies the requested fields before writing', () => {
    expect(route).toContain('classifyYouTubeDraftUpdate(');
    expect(route).toMatch(/success:\s*false/);
  });

  it('writes only the fields the verdict marked as changed', () => {
    expect(route).toMatch(/if \(changes\.videoTitle !== undefined\)/);
    expect(route).toMatch(/if \(changes\.privacyStatus !== undefined\)/);
    expect(route).not.toMatch(/if \(title\) \{\s*post\.videoTitle = title\.trim\(\);/);
  });

  it('answers a missing post with success:false rather than a bare error', () => {
    expect(route).toMatch(/status\(404\)\.json\(\{\s*success:\s*false/);
  });
});
