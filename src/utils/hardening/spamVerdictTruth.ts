// ==============================================================================
// HERMES JARVIS — SPAM SCREEN VERDICT, STATED FROM THE MATCH ONLY
//
// `evaluateSpamRisk()` in src/utils/telephonyEngine.ts returns a `reason` beside
// its score. When no spam keyword matched, that reason was the literal
// `'Verified Legitimate Caller'`. The function performs keyword matching only:
// it never checks a carrier reputation database, a caller-ID attestation (STIR/
// SHAKEN), or contacts. So a first-line string containing none of the nine
// tracked spam words — however suspicious the number — was labelled as *verified
// legitimate*. That is an unmeasured trust verdict on an inbound caller, the
// class item 13 tracks.
//
// A screen that found no indicator may report exactly that. It must not report
// the caller as vetted.
// ==============================================================================

/** Honest reason for a screen that matched no spam indicator. */
export const NO_SPAM_MATCH_REASON = 'No spam indicator matched — caller not vetted';

/**
 * The stored reason for a screen result. A non-empty match reason is preserved
 * verbatim; the absence of a match yields the neutral reason above, never a
 * legitimacy verdict.
 */
export function spamReasonLabel(reason: string | null | undefined): string {
  const trimmed = (reason ?? '').trim();
  return trimmed || NO_SPAM_MATCH_REASON;
}
