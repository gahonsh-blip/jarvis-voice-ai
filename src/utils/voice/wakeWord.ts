// ==============================================================================
// HERMES JARVIS — WAKE WORD MATCHING (backlog item 49)
//
// Detects the wake phrase in a speech transcript and returns the command that
// followed it. Runs on whatever transcript the browser's speech recogniser
// produces, so it makes no claim about audio-level detection.
//
// Browser recognisers are unreliable with Indian-accented English pronunciation
// of "Jarvis", so a short list of plausible mis-hearings is accepted. The list
// is deliberately finite and shown in the settings UI: nothing fuzzy-matches a
// whole transcript, which would make the microphone trigger on ordinary speech.
// ==============================================================================

export interface WakeWordMatch {
  detected: boolean;
  /** Everything after the wake phrase, trimmed. Empty when nothing followed. */
  command: string;
  /** Which phrase variant matched, for diagnostics. */
  matchedPhrase?: string;
}

/** Recogniser mis-hearings accepted for the default "jarvis" wake word. */
export const JARVIS_ALIASES = [
  'jarvis',
  'javis',
  'jarviz',
  'jarvish',
  'jarwis',
  'jervis',
  'jaarvis',
  'javed',
  'jarv',
  'जार्विस',
  'जारविस',
  'जार्वीस',
] as const;

/** Punctuation is dropped so "Jarvis, ..." and "Jarvis ..." behave the same. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:।"'“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Builds the set of phrases to look for, including the user's configured word.
 */
export function wakePhrasesFor(configured: string): string[] {
  const phrases = new Set<string>();
  const trimmed = normalise(configured);
  if (trimmed) phrases.add(trimmed);

  // Only fall back to the built-in aliases for the default wake word. If the
  // user configured something else, their word is the only accepted phrase.
  if (!trimmed || trimmed === 'jarvis' || trimmed === 'hey jarvis') {
    JARVIS_ALIASES.forEach((a) => phrases.add(normalise(a)));
    phrases.add('hey jarvis');
    phrases.add('ok jarvis');
    phrases.add('hi jarvis');
  }

  return Array.from(phrases).filter(Boolean);
}

/**
 * Looks for the wake phrase at the start of a transcript, or anywhere a
 * previous phrase ended. Only the first match is used: a transcript containing
 * the wake word, a command, and the wake word again yields one command.
 */
export function detectWakeWord(transcript: string, configured = 'jarvis'): WakeWordMatch {
  const cleaned = normalise(transcript);
  if (!cleaned) return { detected: false, command: '' };

  const phrases = wakePhrasesFor(configured).sort((a, b) => b.length - a.length);

  for (const phrase of phrases) {
    // Word-boundary match so "jarvis" does not fire inside a longer word. The
    // lookahead keeps the trailing space out of the match, so the command is
    // whatever followed the phrase.
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?:^|\\s)${escaped}(?=\\s|$)`, 'i');
    const match = pattern.exec(cleaned);
    if (!match) continue;

    const after = cleaned.slice(match.index + match[0].length).trim();
    return {
      detected: true,
      command: after,
      matchedPhrase: phrase,
    };
  }

  return { detected: false, command: '' };
}

/**
 * True when a transcript looks like a bare wake word with no command, which
 * means "listen for the next thing I say" rather than "do nothing".
 */
export function isBareWakeWord(transcript: string, configured = 'jarvis'): boolean {
  const match = detectWakeWord(transcript, configured);
  return match.detected && match.command.length === 0;
}