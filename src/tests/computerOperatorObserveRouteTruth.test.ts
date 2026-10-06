// ==============================================================================
// Zero-fake-success guard for `POST /api/computer-operator/observe`.
//
// The route answered `{ success: true, observation, interpretation }` for every
// observation. `ScreenObserver.observeScreen` still returns a full observation
// when it serves the built-in illustrative view (no host source installed) or
// when the host desktop is unreachable (`isAmbiguous`), so a caller reading
// `success` believed the screen had been inspected although nothing was read.
// The flag now follows `observationPerformed` — host-backed and not ambiguous —
// and the route names the outcome in `observed`.
// ==============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { observationPerformed } from '../utils/computerOperator/observationTruth';
import { ScreenObserver, type ObservationSource } from '../utils/computerOperator/screenObserver';
import type { ScreenObservation } from '../types/computerOperator';

const serverSource = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
const flat = serverSource.replace(/\s+/g, ' ');

/** The observe route body, bounded so the flat checks do not match sibling routes. */
const observeRoute = (() => {
  const start = flat.indexOf("app.post('/api/computer-operator/observe',");
  const end = flat.indexOf("app.post('/api/computer-operator/cancel'", start);
  return flat.slice(start, end);
})();

const hostSource = (isAmbiguous = false): ObservationSource => async () => ({
  id: 'host-obs',
  timestamp: new Date().toISOString(),
  activeWindow: 'Terminal',
  activeApplication: 'Terminal',
  windowTitle: 'Terminal',
  visibleElements: [],
  detectedErrors: [],
  screenResolution: { width: 1920, height: 1080 },
  isAmbiguous,
  ambiguityReason: isAmbiguous ? 'no desktop session' : undefined,
  platform: 'linux',
});

const ambiguousObservation: ScreenObservation = {
  id: 'obs-ambiguous',
  timestamp: new Date().toISOString(),
  activeWindow: 'No desktop session',
  activeApplication: 'None',
  windowTitle: '',
  visibleElements: [],
  detectedErrors: [],
  screenResolution: { width: 0, height: 0 },
  isAmbiguous: true,
  ambiguityReason: 'Host state could not be observed.',
  platform: 'linux',
};

const clearObservation: ScreenObservation = { ...ambiguousObservation, id: 'obs-clear', isAmbiguous: false, ambiguityReason: undefined };

afterEach(() => {
  ScreenObserver.setSource(null);
});

describe('the observe route maps its success flag to a real observation', () => {
  it('does not answer a flat success: true for every observation', () => {
    // The old body was `res.json({ success: true, observation, interpretation })`.
    expect(observeRoute).not.toContain('res.json({ success: true, observation, interpretation })');
    expect(observeRoute).toContain('success: observed');
    expect(observeRoute).toContain('observationPerformed(observation');
  });

  it('reports success only for a host-backed, non-ambiguous observation', async () => {
    ScreenObserver.setSource(hostSource(false));
    const observation = await ScreenObserver.observeScreen({ includeScreenshot: false });
    expect(ScreenObserver.isHostBacked()).toBe(true);
    expect(observationPerformed(observation, ScreenObserver.isHostBacked())).toBe(true);
  });

  it('reports failure for an unreachable (ambiguous) host instead of success', async () => {
    ScreenObserver.setSource(hostSource(true));
    const observation = await ScreenObserver.observeScreen({ includeScreenshot: false });
    expect(observation.isAmbiguous).toBe(true);
    expect(observationPerformed(observation, ScreenObserver.isHostBacked())).toBe(false);
  });

  it('reports failure for the built-in illustrative view (no host source) instead of success', async () => {
    ScreenObserver.setSource(null);
    const observation = await ScreenObserver.observeScreen({ includeScreenshot: false });
    // The illustrative view is a full observation, so only the host-backed check
    // can tell it apart from a real one.
    expect(observation.visibleElements.length).toBeGreaterThan(0);
    expect(ScreenObserver.isHostBacked()).toBe(false);
    expect(observationPerformed(observation, ScreenObserver.isHostBacked())).toBe(false);
  });

  it('treats a missing observation as not performed', () => {
    expect(observationPerformed(null, true)).toBe(false);
    expect(observationPerformed(undefined, true)).toBe(false);
    // A host-backed source that reported ambiguity is still not an inspection.
    expect(observationPerformed(ambiguousObservation, true)).toBe(false);
    expect(observationPerformed(clearObservation, true)).toBe(true);
  });
});
