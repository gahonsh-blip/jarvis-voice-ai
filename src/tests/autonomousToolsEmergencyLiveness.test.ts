import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The Autonomous Tools Hub is the panel an operator uses to write files to the
// workspace and queue external GitHub issues. Its header rendered a green
// "DAEMON ACTIVE" badge for every state that was not paused — including the
// state where /api/emergency/status had never answered — because it seeded
// `{ emergencyPaused: false }` and swallowed a failed status fetch. The same
// defect class already fixed on the Permission Gateway. These guards pin the
// tri-state wiring and the fail-closed Level-3 action gate.

const TEMP_SRC = fs.readFileSync(
  path.resolve(__dirname, '../utils/emergencyTruth.ts'),
  'utf8',
);

const MODAL_SRC = fs.readFileSync(
  path.resolve(__dirname, '../components/AutonomousToolsModal.tsx'),
  'utf8',
);

describe('AutonomousToolsModal renders an unknown kill-switch state honestly', () => {
  it('seeds the emergency state as null, not as a fabricated released state', () => {
    expect(MODAL_SRC).toContain('useState<EmergencyControlState | null>(null)');
    expect(MODAL_SRC).not.toContain('useState<EmergencyControlState>({ emergencyPaused: false })');
  });

  it('derives badge, button and the Level-3 gate from the shared tri-state helper', () => {
    expect(MODAL_SRC).toContain('emergencyLiveness(emergency)');
    expect(MODAL_SRC).toContain('emergencyStatusKnown(emergency)');
    expect(MODAL_SRC).toContain('emergencyLivenessLabel(liveness)');
    expect(MODAL_SRC).toContain('actionBlocked');
    // No render path may read the raw paused flag directly.
    expect(MODAL_SRC).not.toContain('emergency.emergencyPaused');
    // The bare "DAEMON ACTIVE" constant must not return.
    expect(MODAL_SRC).not.toContain('🟢 DAEMON ACTIVE');
  });

  it('fails the Level-3 actions closed while the status is unknown', () => {
    expect(MODAL_SRC).toContain('actionBlocked = loading || emergencyPaused || !statusKnown');
    expect(MODAL_SRC).toContain('disabled={actionBlocked}');
  });

  it('does not store a status the endpoint never confirmed', () => {
    expect(MODAL_SRC).toContain('setEmergency(emergencyStatusKnown(data) ? data : null)');
    expect(MODAL_SRC).toContain('if (!emergencyStatusKnown(data)) throw new Error');
  });
});

describe('the tri-state helper the modal now depends on behaves as pinned', () => {
  it('exposes the four functions the modal imports', () => {
    expect(TEMP_SRC).toContain('export function emergencyLiveness');
    expect(TEMP_SRC).toContain('export function emergencyStatusKnown');
    expect(TEMP_SRC).toContain('export function emergencyLivenessLabel');
    expect(TEMP_SRC).toContain('export function emergencyEngaged');
  });
});
