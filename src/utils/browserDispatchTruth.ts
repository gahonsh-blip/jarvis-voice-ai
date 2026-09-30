// ==============================================================================
// HERMES JARVIS — BROWSER DISPATCH TRUTH
//
// The `/api/chat` browser-open intents (`open_google`, `open_youtube`,
// `open_gmail`, `open_chatgpt`) stated a *destination* they were not opening.
// `handleExecuteAction` in `src/App.tsx` cleared the search query and switched to
// the in-app Browser view, but `BrowserModal` initialises its address bar to
// `https://www.google.com` and only follows an `initialUrl`/`initialQuery` prop;
// nothing passed either, so every one of those intents — "open YouTube", "open
// Gmail", "open ChatGPT" — landed on the Google home page while the spoken line
// and the action card named the other site. `open_chrome` and `google_search`
// carry no fixed destination and are unaffected.
//
// A spelled-out destination is only honest if the in-app Browser is actually
// pointed at it, so the site, the reply and the URL the view loads are all
// derived from one table.
// ==============================================================================

const SITE_TO_URL: Record<string, string> = {
  open_google: 'https://www.google.com',
  open_youtube: 'https://www.youtube.com',
  open_gmail: 'https://mail.google.com',
  open_chatgpt: 'https://chatgpt.com',
};

const SITE_LABEL: Record<string, string> = {
  open_google: 'Google',
  open_youtube: 'YouTube',
  open_gmail: 'Gmail',
  open_chatgpt: 'ChatGPT',
};

/**
 * The URL the in-app Browser must load for a browser-open intent, or `null` when
 * the intent names no fixed site (`open_chrome`, `google_search`).
 */
export function browserDestinationUrl(intent: string): string | null {
  return SITE_TO_URL[intent] ?? null;
}

export interface BrowserOpenVerdict {
  /** The site named by the intent, or `null` when the intent names none. */
  site: string | null;
  /** The URL the in-app Browser is pointed at, or `null` for the default home. */
  url: string | null;
  /**
   * True when the reply may name the site: the intent names no site, or the
   * caller resolved the site's exact URL. A named site whose URL was not
   * resolved is reported as the default home instead of being claimed.
   */
  pointed: boolean;
  replyEn: string;
  replyHi: string;
  title: string;
}

const GENERIC_HOME = 'https://www.google.com';

/**
 * Builds the honest verdict for a browser-open intent.
 *
 * @param intent the browser-open intent
 * @param targetUrl the URL the caller resolved for this intent (may be
 *   undefined/empty when the caller has none)
 */
export function browserOpenVerdict(intent: string, targetUrl?: string | null): BrowserOpenVerdict {
  const site = SITE_LABEL[intent] ?? null;
  const expected = browserDestinationUrl(intent);
  const resolved = targetUrl && targetUrl.trim() ? targetUrl.trim() : expected;
  const pointed = !!site && !!expected && resolved === expected;

  if (!site) {
    return {
      site: null,
      url: resolved ?? GENERIC_HOME,
      pointed: true,
      replyEn: 'Opening the in-app Browser view. No external browser was launched.',
      replyHi: 'इन-ऐप ब्राउज़र दृश्य खोला जा रहा है। कोई बाहरी ब्राउज़र नहीं खोला गया।',
      title: 'In-App Browser View (external browser not launched)',
    };
  }

  if (!pointed) {
    return {
      site,
      url: GENERIC_HOME,
      pointed: false,
      replyEn: `The in-app Browser opened at its default home. It could not be pointed at ${site}, so no ${site} page was loaded.`,
      replyHi: `इन-ऐप ब्राउज़र अपने डिफ़ॉल्ट होम पर खुला। उसे ${site} पर नहीं ले जाया जा सका, इसलिए ${site} का कोई पेज लोड नहीं हुआ।`,
      title: `In-App Browser: Default Home (${site} not loaded)`,
    };
  }

  return {
    site,
    url: resolved!,
    pointed: true,
    replyEn: `Opening the in-app Browser at ${site}. No external browser was launched.`,
    replyHi: `इन-ऐप ब्राउज़र ${site} पर खोला जा रहा है। कोई बाहरी ब्राउज़र नहीं खोला गया।`,
    title: `In-App Browser: ${site} (external browser not launched)`,
  };
}

export interface BrowserOpenActionDetail {
  type: string;
  title: string;
  payload: { target: string };
}

/**
 * The `actionDetail` the `/api/chat` browser-open case must emit.
 *
 * The app dispatcher (`handleExecuteAction`) reads the destination from
 * `actionDetail.payload.target`; a destination carried anywhere else (e.g. a
 * top-level `target`) never reaches `BrowserModal`, which then stays on its
 * Google home while the reply and the action card name another site. Keeping the
 * URL inside `payload.target` is what makes the spoken line true.
 */
export function browserOpenActionDetail(verdict: BrowserOpenVerdict): BrowserOpenActionDetail {
  return {
    type: verdict.site ? SITE_LABEL_TO_INTENT[verdict.site] ?? verdict.title : verdict.title,
    title: verdict.title,
    payload: { target: verdict.url ?? GENERIC_HOME },
  };
}

const SITE_LABEL_TO_INTENT: Record<string, string> = {
  Google: 'open_google',
  YouTube: 'open_youtube',
  Gmail: 'open_gmail',
  ChatGPT: 'open_chatgpt',
};

export interface SearchDispatch {
  /** The trimmed query handed to the in-app Browser (may be empty). */
  query: string;
  /** The URL the in-app Browser must load to run the search. */
  url: string;
  title: string;
  replyEn: string;
  replyHi: string;
}

/**
 * Builds the honest search dispatch for a `google_search` request.
 *
 * `google_search` is a *request*, not a completed lookup: the in-app Browser only
 * runs the search when the view is handed the destination URL. `handleExecuteAction`
 * previously cleared the initial URL and passed the bare query to `BrowserModal`,
 * which ignores `initialQuery` whenever `initialUrl` is already set (e.g. the user
 * had opened a page earlier) — in that case the query was dropped and no search
 * ran, while the reply still said it was searching Google. The URL is therefore
 * derived here and carried in `payload.target`, the only place the dispatcher reads.
 */
export function searchDispatch(query: string): SearchDispatch {
  const effective = (query || '').trim();
  const url = effective ? `https://www.google.com/search?q=${encodeURIComponent(effective)}` : GENERIC_HOME;
  return {
    query: effective,
    url,
    title: `In-App Browser Search: ${effective} (external browser not launched)`,
    replyEn: `Searching Google for "${effective}" in the in-app Browser. No external browser was launched.`,
    replyHi: `इन-ऐप ब्राउज़र में Google पर "${effective}" खोजा जा रहा है। कोई बाहरी ब्राउज़र नहीं खोला गया।`,
  };
}
