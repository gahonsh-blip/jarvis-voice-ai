import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  socialRejectOutcome,
  SOCIAL_REJECTION_REQUEST_FAILED,
} from '../utils/hardening/socialActionCommandTruth';

// Regression guard for backlog item 13. `handleRejectLevel4Approval`
// (`src/components/SocialMediaModal.tsx`) discarded the `/api/social/action`
// reject response and unconditionally cleared the staged draft and announced a
// rejection — even when `executeApprovedAction` (`server.ts`) reported the
// rejection was not recorded. The decision logic is exercised directly and the
// wiring is asserted against the component source.
const modalSource = fs.readFileSync(
  path.resolve(process.cwd(), 'src/components/SocialMediaModal.tsx'),
  'utf8'
);

describe('socialRejectOutcome reports only an observed rejection', () => {
  it('treats a confirmed success as recorded and prefers the server message', () => {
    const outcome = socialRejectOutcome({ success: true, message: 'Draft rejected. Post returned to offline draft status.' });
    expect(outcome.recorded).toBe(true);
    expect(outcome.message).toBe('Draft rejected. Post returned to offline draft status.');
  });

  it('supplies an honest default when a confirmed success carries no message', () => {
    const outcome = socialRejectOutcome({ success: true });
    expect(outcome.recorded).toBe(true);
    expect(outcome.message).toBe('Draft rejected. Post returned to offline draft status.');
  });

  it('does not record a rejection the server reported as failed, and surfaces its message', () => {
    const outcome = socialRejectOutcome({
      success: false,
      persisted: false,
      message: 'The rejection could not be written to durable storage; the draft was not changed.',
    });
    expect(outcome.recorded).toBe(false);
    expect(outcome.message).toBe('The rejection could not be written to durable storage; the draft was not changed.');
  });

  it('falls back to an honest line when a failed reply carries no message', () => {
    const outcome = socialRejectOutcome({ success: false });
    expect(outcome.recorded).toBe(false);
    expect(outcome.message).toBe(SOCIAL_REJECTION_REQUEST_FAILED);
  });

  it('treats a missing or malformed body as not recorded', () => {
    for (const body of [null, undefined, {}, 'ok', 42, { success: 'true' }]) {
      const outcome = socialRejectOutcome(body);
      expect(outcome.recorded).toBe(false);
      expect(outcome.message).toBe(SOCIAL_REJECTION_REQUEST_FAILED);
    }
  });
});

describe('handleRejectLevel4Approval no longer fakes a rejection', () => {
  const handler = (() => {
    const start = modalSource.indexOf('const handleRejectLevel4Approval');
    return modalSource.slice(start, modalSource.indexOf('const handleConnectLinkedIn', start));
  })();

  it('reads the server response before acting on it', () => {
    expect(handler).toContain('await res.json()');
    expect(handler).toContain('socialRejectOutcome(');
  });

  it('clears the staged draft only inside the recorded branch', () => {
    // The clear must be gated on `outcome.recorded`, not unconditional.
    expect(handler).toMatch(/if\s*\(outcome\.recorded\)\s*\{[\s\S]*?setYtStagedPost\(null\)/);
  });

  it('does not announce a rejection outside the recorded branch', () => {
    const beforeRecorded = handler.slice(0, handler.indexOf('if (outcome.recorded)'));
    expect(beforeRecorded).not.toContain('rejected and kept offline');
  });
});
