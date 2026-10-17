/**
 * Truth helper for the `set_name` identity intent.
 *
 * The `/api/chat` `set_name` case and the offline engine both recorded whatever
 * text followed the name phrase as the user's name and credited it as executed
 * work. The classifier's name group is greedy over a whitespace class, so a
 * command such as "my name is hello how are you" is classified `set_name` with
 * payload `"hello how are you"`, and a digit-only payload passes the character
 * class too. The case then stored that string verbatim as the owner's identity
 * ("Your identity has been recorded") and set `actionExecuted = true`, advancing
 * the user-visible "Autonomous Actions Executed" counter — a spoken success and
 * a counter bump for an input that canonicalizes to nothing usable.
 *
 * A name clause only counts as performed work when the extracted candidate
 * canonicalizes to a plausible single name: after removing the trailing Hindi
 * copula ("है") and honorifics ("जी"), optional surrounding punctuation and the
 * common phrases the local extractor also strips, it must contain at least one
 * Unicode letter, no digit, and at most three words. The multiple words permit a
 * legitimate full name ("Tony Stark") while rejecting a pasted sentence.
 */

export type SetNameIntentVerdict =
  | {
      kind: 'name';
      name: string;
      actionExecuted: true;
    }
  | {
      kind: 'unusable';
      reason: 'empty' | 'sentence' | 'numeric';
      actionExecuted: false;
    };

const MAX_NAME_WORDS = 3;

/**
 * Canonicalize a raw extracted name candidate. Removes surrounding punctuation
 * and the trailing copula/honorific tokens both extractors already drop, then
 * collapses internal whitespace.
 */
export function canonicalizeNameCandidate(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/^[\s"'“”‘’.,!?;:—–-]+|[\s"'“”‘’.,!?;:—–-]+$/g, '')
    .replace(/\s*(?:है|बुलाओ|hai|ji|जी)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Decide whether a `set_name` classification actually changed the stored
 * identity. Only a plausible, non-empty name is treated as executed work.
 */
export function judgeSetNameIntent(raw: string | null | undefined): SetNameIntentVerdict {
  const name = canonicalizeNameCandidate(raw);
  if (!name) {
    return { kind: 'unusable', reason: 'empty', actionExecuted: false };
  }
  if (/\d/.test(name)) {
    return { kind: 'unusable', reason: 'numeric', actionExecuted: false };
  }
  if (!/\p{L}/u.test(name)) {
    return { kind: 'unusable', reason: 'empty', actionExecuted: false };
  }
  if (name.split(/\s+/).length > MAX_NAME_WORDS) {
    return { kind: 'unusable', reason: 'sentence', actionExecuted: false };
  }
  return { kind: 'name', name, actionExecuted: true };
}
