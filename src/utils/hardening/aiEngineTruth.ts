// ==============================================================================
// HERMES JARVIS — AI ENGINE STATUS TRUTH
//
// `/api/daemon/status` returned `aiEngine.model = 'gemini-2.5-flash'` and
// `provider = 'Google Gemini 2.5 Flash'` unconditionally. When no
// `GEMINI_API_KEY` is present the process answers every request with the
// offline bilingual heuristic engine (`fallbackActive: true`), yet the status
// body still named a Gemini model that was never invoked — a live-looking model
// claim for a model that is not running. These helpers derive the provider and
// model from the API key's presence, and name no model when there is none to
// name, so the reported engine matches the one that actually answers.
// ==============================================================================

/** The Gemini model this server calls when a key is configured. */
export const GEMINI_MODEL = 'gemini-2.5-flash';

/** Provider label for the engine actually in use. */
export function aiEngineProviderLabel(geminiConfigured: boolean): string {
  return geminiConfigured
    ? 'Google Gemini 2.5 Flash'
    : 'Bilingual Heuristic Engine (Offline-Safe)';
}

/**
 * The model name to report, or `null` when the process has no cloud model. The
 * offline heuristic engine is not a model, so nothing is named rather than a
 * guess that would read as if a Gemini model were answering.
 */
export function aiEngineModelName(geminiConfigured: boolean): string | null {
  return geminiConfigured ? GEMINI_MODEL : null;
}
