// ==============================================================================
// Tests for the screen observer's labelling and its pluggable source.
//
// The built-in view is illustrative, so it must say so. The server installs a
// host-backed source, and when that is present it must be used verbatim.
// ==============================================================================

import { describe, it, expect, afterEach } from 'vitest';
import { ScreenObserver, type ObservationSource } from '../utils/computerOperator/screenObserver';
import type { ScreenObservation } from '../types/computerOperator';

afterEach(() => {
  ScreenObserver.setSource(null);
});

describe('ScreenObserver built-in view', () => {
  it('labels illustrative terminal content as SIMULATION_ONLY', async () => {
    const observation = await ScreenObserver.observeScreen({ mockWindow: 'terminal', includeScreenshot: false });
    expect(observation.terminalOutput).toContain('SIMULATION_ONLY');
    // The old view invented a concrete test result; that must be gone.
    expect(observation.terminalOutput).not.toMatch(/\d+ passed/);
  });

  it('never reports a real test count from the built-in view', async () => {
    for (const mockWindow of ['vscode', 'terminal', 'browser', 'desktop'] as const) {
      const observation = await ScreenObserver.observeScreen({ mockWindow, includeScreenshot: false });
      expect(JSON.stringify(observation)).not.toContain('141 passed');
    }
  });

  it('flags an unconfirmed dialog as ambiguous so the planner stops', async () => {
    const observation = await ScreenObserver.observeScreen({ mockWindow: 'error_dialog', includeScreenshot: false });
    expect(observation.isAmbiguous).toBe(true);
    expect(observation.ambiguityReason).toBeTruthy();
  });
});

describe('ScreenObserver with an installed source', () => {
  it('returns the source observation verbatim', async () => {
    const hostObservation: ScreenObservation = {
      id: 'host-obs-1',
      timestamp: new Date().toISOString(),
      activeWindow: 'real window',
      activeApplication: 'Real App',
      windowTitle: 'Real Title',
      visibleElements: [],
      detectedErrors: [],
      screenResolution: { width: 2560, height: 1440 },
      screenshot: '/tmp/real.png',
      isAmbiguous: false,
      platform: 'windows',
    };

    let calledWith: unknown = null;
    const source: ObservationSource = async (options) => {
      calledWith = options;
      return hostObservation;
    };
    ScreenObserver.setSource(source);

    const result = await ScreenObserver.observeScreen({ preferredApp: 'Real App' });
    expect(result).toEqual(hostObservation);
    expect(calledWith).toEqual({ preferredApp: 'Real App' });
    // And it is cached as the last observation.
    expect(ScreenObserver.getLastObservation()).toEqual(hostObservation);
  });

  it('propagates a source failure instead of silently falling back to fiction', async () => {
    const source: ObservationSource = async () => {
      throw new Error('host probe unavailable');
    };
    ScreenObserver.setSource(source);
    await expect(ScreenObserver.observeScreen({})).rejects.toThrow('host probe unavailable');
  });

  it('restores the built-in view when the source is cleared', async () => {
    ScreenObserver.setSource(async () => {
      throw new Error('should not be used');
    });
    ScreenObserver.setSource(null);
    const observation = await ScreenObserver.observeScreen({ mockWindow: 'vscode', includeScreenshot: false });
    expect(observation.activeApplication).toBe('VS Code');
  });
});