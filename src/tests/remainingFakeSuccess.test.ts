import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { screenshotVerdict, screenshotReply } from '../utils/computerOperator/screenshotDispatchTruth';
import { volumeVerdict, volumeReply } from '../utils/computerOperator/audioDispatchTruth';
import { powerVerdict, powerReply } from '../utils/computerOperator/powerDispatchTruth';

// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in launchDispatchTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const engineFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/utils/localJarvisEngine.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const appFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8')
  .replace(/\s+/g, ' ');

/** The case body, bounded at the next block-opening case so it cannot leak into a neighbour. */
function caseBody(intent: string): string {
  const label = serverFlat.indexOf(`case '${intent}':`);
  expect(label, `${intent} case missing`).toBeGreaterThan(-1);
  // Fall-through labels (`case 'volume_down':` after `case 'volume_up':`) share a
  // single block, so start at the block opener and bound at the next `case 'x': {`.
  const blockOpen = serverFlat.indexOf('{', label);
  expect(blockOpen, `${intent} case has no block`).toBeGreaterThan(-1);
  const rest = serverFlat.slice(blockOpen + 1);
  const nextMatch = /case '[a-z_]+': \{/.exec(rest);
  const end = nextMatch ? blockOpen + 1 + nextMatch.index : serverFlat.length;
  return serverFlat.slice(label, Math.min(end, label + 1200));
}

const NO_DISPLAY = {
  LAUNCH_APP: { available: false, reason: 'Requires a desktop session to launch applications.' },
  INSPECT_SCREEN: { available: false, reason: 'No display server.' },
};

const WITH_DISPLAY = {
  LAUNCH_APP: { available: true },
  INSPECT_SCREEN: { available: true },
};

function screenshotReceipt(outcome: string) {
  return {
    action: 'TAKE_SCREENSHOT',
    target: 'screens',
    outcome,
    verified: outcome === 'VERIFIED',
    detailEn: `capture backend said ${outcome}`,
    detailHi: `कैप्चर बैकएंड: ${outcome}`,
  } as any;
}

function screenshotFile() {
  return {
    absolutePath: '/tmp/screens/jarvis-1.png',
    filename: 'jarvis-1.png',
    sizeBytes: 20480,
    width: 1920,
    height: 1080,
    capturedAt: new Date().toISOString(),
    sha256: 'a'.repeat(64),
  };
}

describe('screenshot verdict requires a real file, never a claim', () => {
  it('is CAPTURED only when the receipt is VERIFIED and a file exists', () => {
    const verdict = screenshotVerdict({ receipt: screenshotReceipt('VERIFIED'), file: screenshotFile(), method: 'linux_import' });
    expect(verdict.outcome).toBe('CAPTURED');
    expect(verdict.actionExecuted).toBe(true);
    expect(verdict.file?.sizeBytes).toBe(20480);
  });

  it('a VERIFIED receipt with no file is not a capture', () => {
    const verdict = screenshotVerdict({ receipt: screenshotReceipt('VERIFIED'), file: null, method: 'linux_import' });
    expect(verdict.outcome).toBe('UNVERIFIED');
    expect(verdict.actionExecuted).toBe(false);
  });

  it('reports a headless host as NOT_AVAILABLE without claiming execution', () => {
    const verdict = screenshotVerdict({ receipt: screenshotReceipt('NOT_AVAILABLE'), file: null, method: null });
    expect(verdict.outcome).toBe('NOT_AVAILABLE');
    expect(verdict.actionExecuted).toBe(false);
    expect(screenshotReply(verdict, 'en-US')).toContain('capture backend said NOT_AVAILABLE');
  });

  it('reports a failed capture as FAILED, never as success', () => {
    const verdict = screenshotVerdict({ receipt: screenshotReceipt('FAILED'), file: null, method: 'linux_import' });
    expect(verdict.outcome).toBe('FAILED');
    expect(verdict.actionExecuted).toBe(false);
  });

  it('treats a missing result as UNVERIFIED', () => {
    const verdict = screenshotVerdict(null);
    expect(verdict.outcome).toBe('UNVERIFIED');
    expect(verdict.actionExecuted).toBe(false);
  });
});

describe('volume verdict never claims the system mixer moved', () => {
  it('reports NO_MIXER_BACKEND on a headless Linux host', () => {
    const verdict = volumeVerdict('up', 0.6, 'linux');
    expect(verdict.outcome).toBe('NO_MIXER_BACKEND');
    expect(verdict.actionExecuted).toBe(false);
    expect(verdict.level).toBe(0.8);
    expect(volumeReply(verdict, 'en-US')).toContain('system output level was not changed');
  });

  it('still does not claim a system action on a desktop platform', () => {
    const verdict = volumeVerdict('up', 0.6, 'win32');
    expect(verdict.actionExecuted).toBe(false);
    expect(verdict.outcome).toBe('IN_APP_ADJUSTED');
    expect(volumeReply(verdict, 'en-US')).toContain('The system output level was not changed');
  });

  it('clamps at the ceiling and reports the limit instead of a phantom change', () => {
    const verdict = volumeVerdict('up', 1.0, 'linux');
    expect(verdict.level).toBe(1.0);
    expect(verdict.outcome).toBe('NO_MIXER_BACKEND');
    expect(verdict.detailEn).toContain('maximum');
  });

  it('clamps at the floor', () => {
    const verdict = volumeVerdict('down', 0.1, 'linux');
    expect(verdict.level).toBe(0.1);
    expect(verdict.detailEn).toContain('minimum');
  });
});

describe('power verdict is never executed and always requests approval', () => {
  it('is NOT_IMPLEMENTED with permission required when a display exists', () => {
    const verdict = powerVerdict('shutdown', WITH_DISPLAY);
    expect(verdict.outcome).toBe('NOT_IMPLEMENTED');
    expect(verdict.actionExecuted).toBe(false);
    expect(verdict.permissionRequired).toBe(true);
    expect(powerReply(verdict, 'en-US')).toContain('human approval');
  });

  it('is NOT_AVAILABLE on a headless host', () => {
    const verdict = powerVerdict('restart', NO_DISPLAY);
    expect(verdict.outcome).toBe('NOT_AVAILABLE');
    expect(verdict.actionExecuted).toBe(false);
  });

  it('is BLOCKED when the emergency stop is engaged', () => {
    const verdict = powerVerdict('shutdown', WITH_DISPLAY, true);
    expect(verdict.outcome).toBe('BLOCKED');
    expect(verdict.actionExecuted).toBe(false);
    expect(verdict.permissionRequired).toBe(false);
  });

  it('never claims a shutdown or restart was performed', () => {
    for (const kind of ['shutdown', 'restart'] as const) {
      const verdict = powerVerdict(kind, WITH_DISPLAY);
      expect(verdict.actionExecuted).toBe(false);
      expect(verdict.title).toMatch(/Not Implemented/);
    }
  });
});

describe('the /api/chat dispatch cases use the truth helpers', () => {
  it('take_screenshot captures for real and reports the verdict', () => {
    const body = caseBody('take_screenshot');
    expect(body).toContain('captureScreenshot(');
    expect(body).toContain('screenshotVerdict');
    expect(body).toContain('verdict.actionExecuted');
    expect(body).not.toContain('actionExecuted = true;');
  });

  it('volume_up and volume_down report the in-app verdict', () => {
    for (const intent of ['volume_up', 'volume_down']) {
      const body = caseBody(intent);
      expect(body, intent).toContain('volumeVerdict');
      expect(body, intent).toContain('verdict.actionExecuted');
      expect(body, intent).not.toContain('actionExecuted = true;');
    }
  });

  it('pc_shutdown and pc_restart consult the power verdict and the emergency stop', () => {
    for (const intent of ['pc_shutdown', 'pc_restart']) {
      const body = caseBody(intent);
      expect(body, intent).toContain('powerVerdict');
      expect(body, intent).toContain('isEmergencyStopActive()');
      expect(body, intent).not.toContain('actionExecuted = true;');
    }
  });

  it('open_notepad reaches the real executor instead of a hardcoded success', () => {
    const body = caseBody('open_notepad');
    expect(body).toContain('evaluateLaunchDispatch');
    expect(body).toContain('verdict.actionExecuted');
    expect(body).not.toContain('actionExecuted = true;');
  });

  it('the in-app routing cases disclose that no external app was opened', () => {
    for (const marker of [
      'No external phone dialer was opened.',
      'No external calculator application was opened.',
      'No external Paint application was opened.',
      'No external Chrome process was started.',
      'No external browser was launched.',
    ]) {
      expect(serverFlat, marker).toContain(marker);
    }
  });
});

describe('the offline engine stops claiming actions it cannot perform', () => {
  it('no longer claims to capture the screen', () => {
    expect(engineFlat).not.toContain('Capturing screen display.');
    expect(engineFlat).not.toContain('Screenshot capture ho raha hai.');
  });

  it('no longer claims to change the master audio volume', () => {
    expect(engineFlat).not.toContain('Increasing master audio volume.');
    expect(engineFlat).not.toContain('Decreasing audio volume.');
  });

  it('no longer claims to load external phone records', () => {
    expect(engineFlat).not.toContain('Loading phone call logs and transcripts.');
    expect(engineFlat).not.toContain('Opening Voice AI Telephony Hub.');
  });

  it('the offline screenshot branch sets actionExecuted false', () => {
    const start = engineFlat.indexOf("intent: 'take_screenshot'");
    expect(start).toBeGreaterThan(-1);
    const branch = engineFlat.slice(start, start + 400);
    expect(branch).toContain('actionExecuted: false');
  });

  it('the offline volume branches set actionExecuted false', () => {
    for (const intent of ["intent: 'volume_up'", "intent: 'volume_down'"]) {
      const start = engineFlat.indexOf(intent);
      expect(start, intent).toBeGreaterThan(-1);
      const branch = engineFlat.slice(start, start + 400);
      expect(branch, intent).toContain('actionExecuted: false');
    }
  });
});

describe('the UI slider mirrors the in-app level the server reports', () => {
  it('App.tsx keeps the same +/- 0.2 step and [0.1, 1.0] clamp', () => {
    expect(appFlat).toContain('volume: Math.min(1.0, prev.volume + 0.2)');
    expect(appFlat).toContain('volume: Math.max(0.1, prev.volume - 0.2)');
  });
});
