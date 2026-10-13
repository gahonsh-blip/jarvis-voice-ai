// ==============================================================================
// HERMES JARVIS — SPOKEN BRIEFING HONESTY
//
// The Mobile Personal Status panel carried two constant claims that were true
// for no observable state:
//
//   1. A fixed "SPEECH SYNTHESIZER READY" badge — printed before the Web Speech
//      API was even queried, and kept while the platform had no `speechSynthesis`
//      at all. The app already computes a real tri-state in `buildSpeechDiagnostics`
//      but the modal never received it.
//   2. "Generated from live telemetry reads" for every status object that was
//      not flagged `isSample` — including the case where the fetch failed and
//      `statusData` was still null, i.e. nothing had been read at all.
//
// These helpers are pure and dependency-free so a value that was never observed
// can never render as READY or as live.
// ==============================================================================

export type SpeechReadiness = 'READY' | 'UNAVAILABLE' | 'UNKNOWN';

/** The subset of the TTS diagnostics this helper reads. */
export interface SpeechReadinessShape {
  speechSynthesisAvailable?: boolean;
}

/**
 * Tri-state speech-readiness. `UNKNOWN` until a real boolean has been observed:
 * a diagnostics snapshot of `null` means speech was never exercised, which is
 * not evidence that the synthesizer is ready.
 */
export function speechReadiness(
  diagnostics: SpeechReadinessShape | null | undefined,
  isSpeaking?: boolean
): SpeechReadiness {
  if (isSpeaking) return 'READY';
  if (diagnostics == null || typeof diagnostics.speechSynthesisAvailable !== 'boolean') {
    return 'UNKNOWN';
  }
  return diagnostics.speechSynthesisAvailable ? 'READY' : 'UNAVAILABLE';
}

/** Badge text for the briefing hero card. Never a bare READY for an unqueried state. */
export function speechReadinessLabel(readiness: SpeechReadiness): string {
  if (readiness === 'READY') return 'SPEECH SYNTHESIZER READY';
  if (readiness === 'UNAVAILABLE') return 'SPEECH SYNTHESIS UNAVAILABLE';
  return 'SPEECH STATUS UNKNOWN';
}

/**
 * Status text for the Settings TTS diagnostics row. The pre-fix render read
 * `speechDiagnostics?.speechSynthesisAvailable ? 'Web Speech API Active' : 'API
 * Standby'`, so a `null` diagnostics snapshot — the panel is open before any
 * utterance has run — fell to the else branch and printed a settled "API
 * Standby" for a platform that was never probed. Only an observed boolean may
 * claim either verdict; an unobserved one reports that no probe has run.
 */
export function speechEngineStatusLabel(
  diagnostics: SpeechReadinessShape | null | undefined
): string {
  if (diagnostics == null || typeof diagnostics.speechSynthesisAvailable !== 'boolean') {
    return 'TTS ENGINE NOT PROBED';
  }
  return diagnostics.speechSynthesisAvailable ? 'Web Speech API Active' : 'API Standby';
}

/** Shape of the mobile status snapshot this helper reads provenance from. */
export interface BriefingProvenanceShape {
  isSample?: boolean;
}

/**
 * Provenance of the spoken script. Distinguishes three real states instead of
 * collapsing "fetch failed / never ran" into "live telemetry": `null` is
 * UNKNOWN, `isSample: true` is sample fixtures, and a present non-sample object
 * is a genuine read from this browser's APIs.
 */
export function briefingProvenance(
  statusData: BriefingProvenanceShape | null | undefined
): 'LIVE' | 'SAMPLE' | 'UNKNOWN' {
  if (statusData == null) return 'UNKNOWN';
  return statusData.isSample ? 'SAMPLE' : 'LIVE';
}

/** Label for the spoken-script provenance line. */
export function briefingProvenanceLabel(provenance: 'LIVE' | 'SAMPLE' | 'UNKNOWN'): string {
  if (provenance === 'LIVE') return 'Generated from live telemetry reads';
  if (provenance === 'SAMPLE') return 'Generated from sample fixtures';
  return 'Status unavailable — no telemetry read completed';
}
