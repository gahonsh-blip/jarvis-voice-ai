// ==============================================================================
// Zero-fake-success guard for the Computer Operator modal's observe call.
//
// `POST /api/computer-operator/observe` returns `observed: false` when the host
// desktop was not observed (illustrative view or unreachable host). The modal's
// `observeScreen()` ignored that flag: any 200 with a body `observation` was
// returned as `isPreview: false`, which forced `screenSyncState` to `OBSERVED`
// and printed `SCREEN OBSERVED FROM HOST` for a frame the server had just said
// was not observed. These tests pin the classifier and the wiring that replaces
// the naive body check.
// ==============================================================================

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { classifyHostObservation } from '../utils/hardening/computerOperatorObservationTruth';
import type { ScreenObservation } from '../types/computerOperator';

const observation = (over: Partial<ScreenObservation> = {}): ScreenObservation => ({
  id: 'obs-1',
  timestamp: new Date().toISOString(),
  activeWindow: 'Terminal',
  activeApplication: 'Terminal',
  windowTitle: 'Terminal',
  visibleElements: [],
  detectedErrors: [],
  screenResolution: { width: 1920, height: 1080 },
  isAmbiguous: false,
  platform: 'linux',
  ...over,
});

describe('classifyHostObservation', () => {
  it('treats an explicit host observation as non-preview', () => {
    const verdict = classifyHostObservation({ observed: true, observation: observation() });
    expect(verdict.isPreview).toBe(false);
    expect(verdict.observation).not.toBeNull();
  });

  it('treats a server-denied observation as a preview, even with a full body', () => {
    // The illustrative view still returns a complete observation object; only
    // `observed` distinguishes it from a real host frame.
    const verdict = classifyHostObservation({ observed: false, observation: observation() });
    expect(verdict.isPreview).toBe(true);
    expect(verdict.observation).not.toBeNull();
  });

  it('treats a missing observed flag as a preview, never a live screen', () => {
    expect(classifyHostObservation({ observation: observation() }).isPreview).toBe(true);
  });

  it('reports no observation when the body carried none', () => {
    const verdict = classifyHostObservation({ observed: true });
    expect(verdict.observation).toBeNull();
    expect(verdict.isPreview).toBe(true);
  });

  it('handles a null or undefined body without claiming a live screen', () => {
    expect(classifyHostObservation(null).isPreview).toBe(true);
    expect(classifyHostObservation(undefined).isPreview).toBe(true);
    expect(classifyHostObservation(null).observation).toBeNull();
  });
});

describe('ComputerOperatorModal observe wiring', () => {
  const modalSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/components/ComputerOperatorModal.tsx'),
    'utf8'
  );

  it('derives the preview flag from the server verdict', () => {
    expect(modalSource).toContain('classifyHostObservation(body)');
  });

  it('no longer marks any observation body as a live (non-preview) frame', () => {
    // The old bug: `return { observation: body.observation as ScreenObservation, isPreview: false }`.
    expect(modalSource).not.toContain('isPreview: false');
  });
});
