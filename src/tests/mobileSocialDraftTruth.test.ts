import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  mobileSocialDraftReply,
  resolveMobileSocialDraft,
  type MobileSocialDraft,
} from '../utils/hardening/mobileSocialDraftTruth';

// server.ts binds a port on import, so the source guards read the text, matching
// the convention in remainingFakeSuccess.test.ts. Line comments are stripped so a
// guard that asserts a retired string is gone cannot be tripped by the comment
// that documents it.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n')
  .replace(/\s+/g, ' ');

/** The `create_social_post` branch body from the mobile command handler. */
function socialBranch(): string {
  const label = serverFlat.indexOf("intent === 'create_social_post')");
  expect(label, 'create_social_post branch missing').toBeGreaterThan(-1);
  const rest = serverFlat.slice(label);
  const end = rest.indexOf('} else if (intentData.intent');
  return end === -1 ? rest : rest.slice(0, end);
}

const pendingDraft: MobileSocialDraft = {
  id: 'post-1',
  topic: 'Autonomous AI Architecture',
  platform: 'LinkedIn',
  content: 'A short draft body.',
  status: 'pending_approval',
};

describe('resolveMobileSocialDraft surfaces a real stored draft only', () => {
  it('prefers the pending-approval draft', () => {
    const posts: MobileSocialDraft[] = [
      { id: 'post-2', topic: 'published', status: 'published' },
      pendingDraft,
    ];
    expect(resolveMobileSocialDraft(posts)?.id).toBe('post-1');
  });

  it('falls back to the most recent post when nothing is pending', () => {
    const posts: MobileSocialDraft[] = [
      { id: 'post-9', topic: 'latest', status: 'published' },
      { id: 'post-8', topic: 'older', status: 'published' },
    ];
    expect(resolveMobileSocialDraft(posts)?.id).toBe('post-9');
  });

  it('returns null for an empty or malformed store instead of fabricating one', () => {
    expect(resolveMobileSocialDraft([])).toBeNull();
    expect(resolveMobileSocialDraft(null)).toBeNull();
    expect(resolveMobileSocialDraft(undefined)).toBeNull();
  });
});

describe('mobileSocialDraftReply never presents a lookup as a creation', () => {
  it('labels a found draft as an existing draft, not a newly created one', () => {
    const reply = mobileSocialDraftReply([pendingDraft]);
    expect(reply.found).toBe(true);
    expect(reply.draftId).toBe('post-1');
    expect(reply.replyText).toContain('EXISTING SOCIAL MEDIA DRAFT');
    expect(reply.replyText).toContain('Autonomous AI Architecture');
    expect(reply.replyText).toContain('LinkedIn');
    expect(reply.replyText).not.toContain('NEW SOCIAL MEDIA POST DRAFTED');
    // The reply states plainly that nothing new was generated.
    expect(reply.replyText).toContain('कोई नया post नहीं बनाया');
  });

  it('reports no draft with no action target when the store is empty', () => {
    const reply = mobileSocialDraftReply([]);
    expect(reply.found).toBe(false);
    expect(reply.draftId).toBeNull();
    expect(reply.replyText).toContain('NO SOCIAL MEDIA DRAFT');
    expect(reply.replyText).not.toContain('NEW SOCIAL MEDIA POST DRAFTED');
  });

  it('does not render an empty or missing content value as stored content', () => {
    const reply = mobileSocialDraftReply([{ id: 'p', topic: 't', platform: 'x', content: '' }]);
    expect(reply.replyText).toContain('(no content stored on this draft)');
  });

  it('names a missing topic/platform rather than leaving blank labels', () => {
    const reply = mobileSocialDraftReply([{ id: 'p', content: 'body' }]);
    expect(reply.replyText).toContain('untitled draft');
    expect(reply.replyText).toContain('platform not recorded');
  });
});

describe('the create_social_post mobile branch reports the lookup honestly', () => {
  it('routes through the truth helper', () => {
    const branch = socialBranch();
    expect(branch).toContain('mobileSocialDraftReply(memoryState.socialPosts)');
    expect(branch).toContain('botReplyText = socialDraft.replyText');
  });

  it('no longer claims a post was drafted when it only looked one up', () => {
    const branch = socialBranch();
    // The reply literal no longer carries the "drafted" claim (the branch's own
    // comment quotes the retired string, so match the assignment, not the word).
    expect(branch).not.toContain('botReplyText = `📱 *NEW SOCIAL MEDIA POST DRAFTED*');
    // The unsafe fallback that threw on an empty store is gone.
    expect(branch).not.toContain('activeDraft');
  });

  it('only wires the approval keyboard when a real draft id exists', () => {
    const branch = socialBranch();
    expect(branch).toContain('if (socialDraft.found && socialDraft.draftId)');
    const guardIndex = branch.indexOf('if (socialDraft.found && socialDraft.draftId)');
    const keyboardIndex = branch.indexOf('inline_keyboard:');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(keyboardIndex).toBeGreaterThan(guardIndex);
  });
});
