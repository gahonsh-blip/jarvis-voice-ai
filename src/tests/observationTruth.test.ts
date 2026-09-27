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
  observationInterpretationNotice,
  observationOperatorStateLabel,
  observationActiveAppLabel,
  observationStreamHeader,
  observationWindowTitleLabel,
  observationElementsParsedLabel,
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

describe('observationInterpretationNotice', () => {
  it('withholds the summary for an illustrative preview', () => {
    const notice = observationInterpretationNotice(baseObservation, true);
    expect(notice).toContain('Interpretation withheld');
    expect(notice).toContain('illustrative preview');
  });

  it('withholds the summary when the host desktop was not observed', () => {
    const notice = observationInterpretationNotice(ambiguousObservation, false);
    expect(notice).toContain('Interpretation withheld');
  });

  it('withholds the summary when there is no observation at all', () => {
    expect(observationInterpretationNotice(null, false)).toContain('Interpretation withheld');
  });

  it('allows the summary only for a real host observation', () => {
    expect(observationInterpretationNotice(baseObservation, false)).toBeNull();
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

  it('gates the semantic interpretation summary behind the truth helper', () => {
    expect(src).toContain('observationInterpretationNotice');
    expect(src).toContain('interpretationNotice ??');
  });

  it('derives the ACTIVE APP readout instead of printing the raw field', () => {
    expect(src).toContain('observationActiveAppLabel(currentObservation, observationIsPreview)');
    expect(src).not.toContain("ACTIVE APP: {currentObservation?.activeApplication || 'None'}");
  });

  it('gates the running status line behind the state helper', () => {
    expect(src).toContain('observationOperatorStateLabel(');
    expect(src).not.toContain("'OPERATOR ACTIVE: OBSERVING SCREEN'");
  });

  it('no longer hardcodes a live command-stream claim', () => {
    expect(src).toContain('observationStreamHeader(observationIsPreview)');
    expect(src).not.toContain('LIVE COMMAND STREAM & TELEMETRY');
  });

  it('derives the fake window title bar from the truth helper', () => {
    expect(src).toContain('observationWindowTitleLabel(currentObservation, observationIsPreview)');
    expect(src).not.toContain("currentObservation?.windowTitle || 'Desktop Observation'");
  });

  it('derives the parsed-element count from the truth helper', () => {
    expect(src).toContain('observationElementsParsedLabel(currentObservation, observationIsPreview)');
    expect(src).not.toContain('UI Elements Parsed');
  });
});

describe('observation window title / parsed-element truth', () => {
  it('does not name a window for an illustrative preview', () => {
    expect(observationWindowTitleLabel(baseObservation, true)).toBe('WINDOW NOT OBSERVED');
  });

  it('does not name a window for an unreachable host', () => {
    expect(observationWindowTitleLabel(ambiguousObservation, false)).toBe('WINDOW NOT OBSERVED');
    expect(observationWindowTitleLabel(null, false)).toBe('WINDOW NOT OBSERVED');
  });

  it('reports the window title only when it was really observed', () => {
    expect(observationWindowTitleLabel(baseObservation, false)).toBe('main.ts');
  });

  it('never renders an empty observed window title as a name', () => {
    expect(observationWindowTitleLabel({ ...baseObservation, windowTitle: '   ' }, false)).toBe(
      'WINDOW TITLE NOT REPORTED'
    );
  });

  it('never advertises parsed elements for a preview or an unreachable host', () => {
    expect(observationElementsParsedLabel(baseObservation, true)).toBe('NO SCREEN CONTENT OBSERVED');
    expect(observationElementsParsedLabel(ambiguousObservation, false)).toBe(
      'NO SCREEN CONTENT OBSERVED'
    );
    expect(observationElementsParsedLabel(null, false)).toBe('NO SCREEN CONTENT OBSERVED');
  });

  it('reports the parsed-element count for a real observation', () => {
    expect(observationElementsParsedLabel(baseObservation, false)).toBe('0 UI Elements Parsed');
    expect(
      observationElementsParsedLabel(
        { ...baseObservation, visibleElements: [{} as any, {} as any] },
        false
      )
    ).toBe('2 UI Elements Parsed');
  });

  it('singularises a one-element count', () => {
    expect(
      observationElementsParsedLabel({ ...baseObservation, visibleElements: [{} as any] }, false)
    ).toBe('1 UI Element Parsed');
  });
});

describe('observation operator-truth labels', () => {
  const observed = baseObservation;

  it('does not claim to observe a live desktop for an illustrative preview', () => {
    const label = observationOperatorStateLabel(observed, true, true);
    expect(label).toContain('ILLUSTRATIVE');
    expect(label).not.toContain('OBSERVING SCREEN');
  });

  it('does not claim observation when the host desktop is unreachable', () => {
    const label = observationOperatorStateLabel(ambiguousObservation, false, true);
    expect(label).toBe('OPERATOR ACTIVE: SCREEN UNOBSERVED');
  });

  it('claims observation only for a real, non-ambiguous observation', () => {
    expect(observationOperatorStateLabel(observed, false, true)).toBe(
      'OPERATOR ACTIVE: OBSERVING SCREEN'
    );
  });

  it('falls back to the derived sync label when idle', () => {
    expect(observationOperatorStateLabel(observed, true, false)).toBe(
      screenSyncLabel(observed, true)
    );
  });

  it('withholds the active application unless it was really observed', () => {
    expect(observationActiveAppLabel(observed, true)).toBe('ACTIVE APP: NOT OBSERVED');
    expect(observationActiveAppLabel(null, false)).toBe('ACTIVE APP: NOT OBSERVED');
    expect(observationActiveAppLabel(observed, false)).toBe('ACTIVE APP: VS Code');
  });

  it('never renders an empty observed application as a name', () => {
    expect(observationActiveAppLabel({ ...observed, activeApplication: '   ' }, false)).toBe(
      'ACTIVE APP: NOT REPORTED'
    );
  });

  it('labels the stream as illustrative only for a preview', () => {
    expect(observationStreamHeader(true)).toContain('ILLUSTRATIVE');
    expect(observationStreamHeader(false)).not.toContain('LIVE');
  });
});
