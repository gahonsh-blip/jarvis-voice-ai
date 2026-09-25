// ==============================================================================
// HERMES JARVIS — YOUTUBE VOICE STATUS TRUTH
//
// The `/api/chat` `youtube_status_inquiry` branch answered every successful
// token lookup with "YouTube Channel ... is active, verified, and ready. OAuth
// 2.0 token status is nominal." `ensureValidYouTubeToken()` only proves that a
// token exists or that a refresh call to Google's token endpoint returned a
// non-expired credential — it never probes the channel and never inspects the
// granted scopes. The branch also asserted a hardcoded 'Connected Channel'
// when no channel name had ever been read, and claimed "nominal" quota which
// nothing measures. These helpers derive the reply from the two facts the
// server actually holds (credential validity and the recorded scope grant) and
// name nothing else.
// ==============================================================================

import { publishScopeGranted, describeGrantedScopes } from '../socialPublishHonesty';

/** The facts the voice branch holds after `ensureValidYouTubeToken()`. */
export interface YouTubeVoiceStatusFacts {
  /** Whether the local token check succeeded (credential validity only). */
  tokenValid: boolean;
  /** The channel title recorded on the memory connection, if any. */
  channelTitle?: string | null;
  /** The scopes recorded for this connection, or undefined if never recorded. */
  scopes?: string[];
}

/**
 * The three reply modes the offline engine renders.
 *
 * `hinglish` is a distinct mode and must not be folded into `hi`: the engine
 * previously reached its Hindi branch for a Hinglish request because
 * `'hinglish'.startsWith('hi')` is true.
 */
export type YouTubeVoiceMode = 'en' | 'hi' | 'hinglish';

/**
 * The facts the *offline* engine holds. It never performs a network call, so
 * it can only report the on-device record — not a token refresh and not a
 * channel probe.
 */
export interface YouTubeOfflineStatusFacts {
  /** Whether the memory store carries a connection record at all. */
  connected: boolean;
  /** The channel title recorded on the memory connection, if any. */
  channelTitle?: string | null;
  /** The scopes recorded for this connection, or undefined if never recorded. */
  scopes?: string[];
  /** ISO 8601 expiry recorded with the credential, if any. */
  expiresAt?: string | null;
  /** The instant the record is being read, for expiry comparison. */
  now?: Date;
}

// A token refresh validates the credential, it does not observe the channel.
const TOKEN_ONLY_NOTE = {
  en: 'the OAuth token was refreshed locally, which confirms the credential but does not probe the channel',
  hi: 'OAuth टोकन स्थानीय रूप से रिफ़्रेश हुआ, जो केवल क्रेडेंशियल की पुष्टि करता है — चैनल की जाँच नहीं करता',
};
const NO_CHANNEL_READ = {
  en: 'no channel has been read for this connection yet — run "Test connection" in the Social Hub to confirm the channel and its upload grant',
  hi: 'इस कनेक्शन के लिए अभी कोई चैनल पढ़ा नहीं गया — चैनल और उसके अपलोड ग्रांट की पुष्टि के लिए Social Hub में "Test connection" चलाएँ',
};

function publishSentence(scopes: string[] | undefined, hindi: boolean): string {
  const grant = publishScopeGranted('youtube', scopes);
  if (grant === true) {
    return hindi
      ? 'अपलोड अनुमति: पुष्ट (youtube.upload रिकॉर्ड में है)।'
      : 'Upload authorization: confirmed (youtube.upload is on record).';
  }
  if (grant === false) {
    return hindi
      ? 'अपलोड अनुमति: पुष्ट नहीं — अपलोड स्कोप रिकॉर्ड में नहीं है।'
      : 'Upload authorization: not confirmed — the upload scope is not on record.';
  }
  return hindi
    ? 'अपलोड अनुमति: अज्ञात — कोई स्कोप ग्रांट कभी रिकॉर्ड नहीं हुआ।'
    : 'Upload authorization: unknown — no scope grant was ever recorded.';
}

/**
 * The spoken reply for a YouTube status inquiry. Never asserts a verified
 * channel, a nominal quota, or a publish grant that the server did not observe.
 */
export function youtubeVoiceStatusReply(
  facts: YouTubeVoiceStatusFacts,
  hindi: boolean
): string {
  const { tokenValid, channelTitle, scopes } = facts;

  if (!tokenValid) {
    return hindi
      ? 'YouTube चैनल अभी कनेक्टेड नहीं है। Settings में Google OAuth क्रेडेंशियल्स दर्ज करके "Connect YouTube" पर क्लिक करें।'
      : 'YouTube is not currently connected. Please configure Google OAuth credentials in Settings and click "Connect YouTube".';
  }

  const name = (channelTitle || '').trim();

  if (!name) {
    return hindi
      ? `YouTube OAuth क्रेडेंशियल मौजूद हैं और टोकन जाँच स्थानीय रूप से सफल रही, लेकिन ${NO_CHANNEL_READ.hi}।`
      : `YouTube OAuth credentials are present and the token check passed locally, but ${NO_CHANNEL_READ.en}.`;
  }

  const publish = publishSentence(scopes, hindi);
  const note = hindi ? TOKEN_ONLY_NOTE.hi : TOKEN_ONLY_NOTE.en;
  const scopeText = describeGrantedScopes(scopes);

  return hindi
    ? `YouTube चैनल "${name}" कनेक्टेड है — ${note}। ${publish} रिकॉर्ड किए गए स्कोप: ${scopeText}।`
    : `YouTube channel "${name}" is connected — ${note}. ${publish} Recorded scopes: ${scopeText}.`;
}

/**
 * Deterministic record-freshness classification for the offline engine.
 *
 * Returns `unknown` when no expiry was recorded: an absent expiry is the
 * absence of an observation, so it is never read as "still valid".
 */
export function offlineTokenFreshness(
  expiresAt: string | null | undefined,
  now: Date
): 'fresh' | 'expired' | 'unknown' {
  if (!expiresAt) return 'unknown';
  const at = Date.parse(expiresAt);
  if (Number.isNaN(at)) return 'unknown';
  return at <= now.getTime() ? 'expired' : 'fresh';
}

/**
 * The reply the *offline* engine may give for a YouTube status inquiry.
 *
 * It must never claim "connected and verified", "API verified", a "ready"
 * pipeline, or "Level-4" enforcement, and it must never name a channel that
 * was not recorded. The engine has no network access here, so the only honest
 * statement is what the local record holds: whether a connection exists, which
 * channel was recorded, whether the credential's recorded expiry has passed,
 * and whether an upload scope is on record.
 */
export function youtubeOfflineStatusReply(
  facts: YouTubeOfflineStatusFacts,
  mode: YouTubeVoiceMode
): string {
  const { connected, channelTitle, scopes, expiresAt } = facts;
  const now = facts.now ?? new Date();
  const name = (channelTitle || '').trim();

  if (!connected) {
    return mode === 'hi'
      ? 'YouTube अभी connected नहीं है। OAuth 2.0 authorization बाकी है। आप Settings या Integrations से इसे 1-Click में जोड़ सकते हैं।'
      : mode === 'hinglish'
      ? 'YouTube abhi connect nahi hai, Sir. OAuth authorization pending hai. Aap Settings se 1-click connect kar sakte hain.'
      : 'YouTube is currently not connected, Sir. OAuth 2.0 authorization is required before channel data or video uploads can be processed.';
  }

  const freshness = offlineTokenFreshness(expiresAt, now);
  const publish = publishScopeGranted('youtube', scopes);
  const probeHint =
    mode === 'hi'
      ? 'चैनल और अपलोड अनुमति की पुष्टि के लिए Social Hub में "Test connection" चलाएँ'
      : mode === 'hinglish'
      ? 'channel aur upload permission confirm karne ke liye Social Hub mein "Test connection" chalayein'
      : 'run "Test connection" in the Social Hub to confirm the channel and its upload grant';

  const expiryText =
    freshness === 'expired'
      ? mode === 'hi'
        ? 'क्रेडेंशियल की रिकॉर्ड की गई अवधि समाप्त हो चुकी है — दोबारा कनेक्ट करें'
        : mode === 'hinglish'
        ? 'credential ki expiry beet chuki hai — dobara connect karein'
        : 'The credential expiry on record has already passed — reconnect before relying on it'
      : freshness === 'fresh'
      ? mode === 'hi'
        ? 'क्रेडेंशियल की रिकॉर्ड की गई अवधि अभी समाप्त नहीं हुई'
        : mode === 'hinglish'
        ? 'credential ki recorded expiry abhi beet nahi hui'
        : 'The credential expiry on record has not passed yet'
      : mode === 'hi'
      ? 'क्रेडेंशियल की कोई समाप्ति रिकॉर्ड नहीं है'
      : mode === 'hinglish'
      ? 'credential ki koi expiry record nahi hai'
      : 'No credential expiry was recorded';

  const publishText =
    publish === true
      ? mode === 'hi'
        ? 'अपलोड अनुमति रिकॉर्ड में है'
        : mode === 'hinglish'
        ? 'upload permission record mein hai'
        : 'An upload scope is on record'
      : publish === false
      ? mode === 'hi'
        ? 'अपलोड स्कोप रिकॉर्ड में नहीं है'
        : mode === 'hinglish'
        ? 'upload scope record mein nahi hai'
        : 'The upload scope is not on record'
      : mode === 'hi'
      ? 'अपलोड अनुमति अज्ञात है'
      : mode === 'hinglish'
      ? 'upload permission unknown hai'
      : 'The upload grant is unknown';

  if (!name) {
    return mode === 'hi'
      ? `YouTube का कनेक्शन रिकॉर्ड मौजूद है, लेकिन अभी कोई चैनल नहीं पढ़ा गया। ${expiryText}। ${publishText} — ${probeHint}।`
      : mode === 'hinglish'
      ? `Sir, YouTube ka connection record hai, lekin abhi koi channel read nahi hua. ${expiryText}. ${publishText} — ${probeHint}.`
      : `YouTube has a stored connection record, but no channel has been read yet. ${expiryText}. ${publishText} — ${probeHint}.`;
  }

  return mode === 'hi'
    ? `YouTube चैनल "${name}" ऑफ़लाइन मेमोरी में रिकॉर्ड है — इसे इस स्लॉट में सत्यापित नहीं किया गया। ${expiryText}। ${publishText} — ${probeHint}।`
    : mode === 'hinglish'
    ? `Sir, YouTube channel "${name}" offline memory mein record hai — is slot mein verify nahi hua. ${expiryText}. ${publishText} — ${probeHint}.`
    : `YouTube channel "${name}" is recorded in offline memory — it was not verified in this slot. ${expiryText}. ${publishText} — ${probeHint}.`;
}
