// =============================================================================
// HERMES JARVIS — Controlled web fetch truth (backlog item 13)
//
// `realWebFetch` (`server_tools.ts`) answered `{ success: true, title, url,
// textContent }` whenever the HTTP response was 2xx, and when no `<title>` was
// present it labelled the page with the hostname (`parsedUrl.hostname`). A
// 2xx response whose body is a bot-check / consent interstitial, an empty
// shell, or a JavaScript-only page therefore read as a successfully fetched and
// cleaned web page — the tool reported research work while `textContent` was
// empty or a bare hostname was presented as the page title.
//
// A fetch only retrieved something when the cleaned body actually carries
// readable text. This module decides that from the bytes alone, so the fetch
// route can refuse a page that exposed nothing instead of claiming success.
// =============================================================================

// A page that yields fewer than this many characters of readable text after
// scripts/styles/markup are stripped supplied nothing to analyse. The bound is
// deliberately low so a genuinely terse page (a short plain-text file) still
// counts; it only catches empty shells and script-only pages.
export const MIN_READABLE_CHARS = 10;

export interface WebFetchContentVerdict {
  /** Whether the cleaned body carried enough readable text to be a real fetch. */
  usable: boolean;
  /** The page's own title, or `null` when the page exposed none. */
  title: string | null;
  /** Whether a real title tag / og:title was observed (never the hostname). */
  titleObserved: boolean;
  /** The cleaned, whitespace-collapsed visible text. */
  textContent: string;
  /** Length of `textContent`. */
  chars: number;
  /** Why the page is unusable, when it is. */
  reason?: string;
}

function firstMatch(html: string, pattern: RegExp): string | null {
  const match = html.match(pattern);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Clean an HTML body down to its visible text using the same stripping the
 * fetch route has always applied, and report whether what remains is real.
 */
export function classifyWebFetchContent(rawHtml: unknown): WebFetchContentVerdict {
  if (typeof rawHtml !== 'string' || rawHtml.length === 0) {
    return {
      usable: false,
      title: null,
      titleObserved: false,
      textContent: '',
      chars: 0,
      reason: 'the response carried no body',
    };
  }

  // Prefer the explicit social title; fall back to the document title. Never
  // the hostname — an unobserved title stays null.
  const ogTitle = firstMatch(rawHtml, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  const docTitle = firstMatch(rawHtml, /<title[^>]*>([^<]+)<\/title>/i);
  const title = (ogTitle || docTitle || '').trim() || null;

  const textContent = rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    // Drop the head entirely: the title/meta text is not page body content, so
    // a consent page must not satisfy the readable-text test via its <title>.
    .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  const chars = textContent.length;
  if (chars < MIN_READABLE_CHARS) {
    return {
      usable: false,
      title,
      titleObserved: title !== null,
      textContent,
      chars,
      reason: `the page exposed no readable text (${chars} characters after cleaning)`,
    };
  }

  return {
    usable: true,
    title,
    titleObserved: title !== null,
    textContent,
    chars,
  };
}
