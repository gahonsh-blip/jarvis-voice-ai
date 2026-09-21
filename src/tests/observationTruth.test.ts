// ==============================================================================
// Tests for the Computer Operator's observation-truth labels.
//
// Regression guard for three fabricated live-screen claims in this modal:
//   1. "STANDBY: SCREEN SYNCHRONIZED" with a green dot, rendered even when the
//      host desktop could not be observed at all.
//   2. A resolution badge printing "0x0" on an unobservable host.
//   3. A "Resolution:" field whose value was actually the *platform* string.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { ScreenObservation } from '../types/computerOperator';
import {
  screenSyncState,
  screenSyncLabel,
  observationPlatformLabel,
  observationResolutionLabel,
  observationAmbiguityNotice,
} from '../utils/computerOperator/observationTruth';

const baseObservation: ScreenObservation = {
  id: 'obs-1',
  timestamp: '2026-09-21T18:00:00.000Z',
  activeWindow: 'editor',
  activeApplication: 'VS Code',
  windowTitle: 'main.ts',
  visibleElements: [],
  detectedErrors: [],
  screenResolution: { width: 1920, height: 1080 },
  isAmbiguous: false,
  platform: 'linux',
};

const ambiguousObservation: ScreenObservation = {
  ...baseObservation,
  id: 'obs-2',
  isAmbiguous: true,
  ambiguityReason: 'Host state could not be observed: headless Linux host.',
  screenResolution: { width: 0, height: 0 },
  activeApplication: 'None',
};

describe('screenSyncState', () => {
  it('holds at ILLUSTRATIVE for the built-in preview view', () => {
    expect(screenSyncState(baseObservation, true)).toBe('ILLUSTRATIVE');
  });

  it('reports UNOBSERVED when there is no observation at all', () => {
    expect(screenSyncState(null, false)).toBe('UNOBSERVED');
  });

  it('reports UNOBSERVED for a host observation flagged ambiguous', () => {
    expect(screenSyncState(ambiguousObservation, false)).toBe('UNOBSERVED');
  });

  it('reports OBSERVED only for a real, non-ambiguous host observation', () => {
    expect(screenSyncState(baseObservation, false)).toBe('OBSERVED');
  });
});

describe('screenSyncLabel', () => {
  it('never claims the screen is synchronized for an ambiguous observation', () => {
    const label = screenSyncLabel(ambiguousObservation, false);
    expect(label).not.toMatch(/SYNCHRONIZED/i);
    expect(label).toContain('NOT OBSERVED');
  });

  it('labels the preview as illustrative rather than live', () => {
    const label = screenSyncLabel(baseObservation, true);
    expect(label).toContain('ILLUSTRATIVE');
    expect(label).toContain('NOT REAL SCREEN STATE');
  });

  it('states the screen was observed from the host when it genuinely was', () => {
    expect(screenSyncLabel(baseObservation, false)).toBe('SCREEN OBSERVED FROM HOST');
  });
});

describe('observationPlatformLabel', () => {
  it('labels a reported platform as a platform, not a resolution', () => {
    expect(observationPlatformLabel(baseObservation)).toBe('Platform: linux');
  });

  it('reports UNKNOWN when no platform was reported', () => {
    expect(observationPlatformLabel(null)).toBe('Platform: UNKNOWN');
    expect(observationPlatformLabel({ ...baseObservation, platform: '' as ScreenObservation['platform'] })).toBe('Platform: UNKNOWN');
  });
});

describe('observationResolutionLabel', () => {
  it('renders a measured resolution', () => {
    expect(observationResolutionLabel(baseObservation)).toBe('1920x1080');
  });

  it('reports UNKNOWN instead of 0x0 when the host reported no resolution', () => {
    const label = observationResolutionLabel(ambiguousObservation);
    expect(label).toBe('UNKNOWN');
    expect(label).not.toContain('0x0');
  });

  it('reports UNKNOWN when there is no observation', () => {
    expect(observationResolutionLabel(null)).toBe('UNKNOWN');
  });
});

describe('observationAmbiguityNotice', () => {
  it('returns the host reason for an ambiguous observation', () => {
    expect(observationAmbiguityNotice(ambiguousObservation, false)).toBe(
      'Host state could not be observed: headless Linux host.'
    );
  });

  it('explains that a preview is not real screen state', () => {
    const notice = observationAmbiguityNotice(baseObservation, true);
    expect(notice).toContain('Illustrative preview');
  });

  it('returns nothing for a real host observation', () => {
    expect(observationAmbiguityNotice(baseObservation, false)).toBeNull();
  });
});

describe('ComputerOperatorModal does not print unmeasured screen state', () => {
  const src = fs.readFileSync(
    path.resolve(__dirname, '../components/ComputerOperatorModal.tsx'),
    'utf8'
  );

  it('removed the unconditional synchronized-screen claim', () => {
    expect(src).not.toContain('STANDBY: SCREEN SYNCHRONIZED');
  });

  it('no longer prints the platform string inside a Resolution: field', () => {
    expect(src).not.toContain('Resolution: {currentObservation?.platform');
  });

  it('no longer prints raw 0x0-capable resolution dimensions', () => {
    expect(src).not.toContain('{currentObservation?.screenResolution.width}x');
  });

  it('derives its state indicator from the truth helpers', () => {
    expect(src).toContain('screenSyncLabel');
    expect(src).toContain('observationResolutionLabel');
    expect(src).toContain('observationPlatformLabel');
  });
});
