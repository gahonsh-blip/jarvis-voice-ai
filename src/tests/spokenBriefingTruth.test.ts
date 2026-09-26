import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  speechReadiness,
  speechReadinessLabel,
  briefingProvenance,
  briefingProvenanceLabel,
} from '../utils/spokenBriefingTruth';

// Regression guard for fabricated status claims in the Mobile Personal Status
// panel. Before this fix the briefing hero card printed a constant
// "SPEECH SYNTHESIZER READY" before the Web Speech API had been queried, and the
// spoken-script provenance line read "Generated from live telemetry reads" for
// every snapshot that was not flagged `isSample` — including the null snapshot
// left behind by a failed fetch.

const MODAL_PATH = path.resolve(__dirname, '../components/MobilePersonalStatusModal.tsx');
const modalSource = fs.readFileSync(MODAL_PATH, 'utf8');
const APP_PATH = path.resolve(__dirname, '../App.tsx');
const appSource = fs.readFileSync(APP_PATH, 'utf8');

describe('speechReadiness refuses to claim READY before synthesis is observed', () => {
  it('treats a missing diagnostics snapshot as UNKNOWN, not READY', () => {
    expect(speechReadiness(null)).toBe('UNKNOWN');
    expect(speechReadiness(undefined)).toBe('UNKNOWN');
    expect(speechReadiness({})).toBe('UNKNOWN');
    expect(speechReadinessLabel('UNKNOWN')).toBe('SPEECH STATUS UNKNOWN');
  });

  it('maps an observed boolean to READY or UNAVAILABLE only', () => {
    expect(speechReadiness({ speechSynthesisAvailable: true })).toBe('READY');
    expect(speechReadiness({ speechSynthesisAvailable: false })).toBe('UNAVAILABLE');
    expect(speechReadinessLabel('UNAVAILABLE')).toBe('SPEECH SYNTHESIS UNAVAILABLE');
  });

  it('reports READY while an utterance is actually playing', () => {
    expect(speechReadiness(null, true)).toBe('READY');
  });
});

describe('briefingProvenance never collapses an unread snapshot into live telemetry', () => {
  it('treats a null snapshot as UNKNOWN', () => {
    expect(briefingProvenance(null)).toBe('UNKNOWN');
    expect(briefingProvenance(undefined)).toBe('UNKNOWN');
    expect(briefingProvenanceLabel('UNKNOWN')).toContain('no telemetry read completed');
  });

  it('distinguishes sample fixtures from a genuine local read', () => {
    expect(briefingProvenance({ isSample: true })).toBe('SAMPLE');
    expect(briefingProvenance({ isSample: false })).toBe('LIVE');
    expect(briefingProvenanceLabel('SAMPLE')).toBe('Generated from sample fixtures');
    expect(briefingProvenanceLabel('LIVE')).toBe('Generated from live telemetry reads');
  });
});

describe('the modal renders only observed speech/telemetry state', () => {
  it('no longer hardcodes a READY badge or a live-telemetry provenance string', () => {
    expect(modalSource).not.toContain('SPEECH SYNTHESIZER READY\n');
    expect(modalSource).not.toMatch(/['"]Generated from live telemetry reads['"]/);
  });

  it('reads the real diagnostics passed down from App', () => {
    expect(modalSource).toContain('speechReadiness(speechDiagnostics, isSpeaking)');
    expect(modalSource).toContain('briefingProvenanceLabel(briefingProvenance(statusData))');
    expect(appSource).toContain('speechDiagnostics={speechDiagnostics}');
  });
});
