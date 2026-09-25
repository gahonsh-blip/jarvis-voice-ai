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
