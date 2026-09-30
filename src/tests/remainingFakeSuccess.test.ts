import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { screenshotVerdict, screenshotReply, browserCaptureVerdict } from '../utils/computerOperator/screenshotDispatchTruth';
import { volumeVerdict, volumeReply } from '../utils/computerOperator/audioDispatchTruth';
import { powerVerdict, powerReply } from '../utils/computerOperator/powerDispatchTruth';
import { processOfflineCommand } from '../utils/localJarvisEngine';
import { buildYouTubeSummary } from '../../server_tools';

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

// The in-app Browser disclosures live in the browser truth helper rather than in
// server.ts, so the routing guard reads that layer too.
const browserTruthFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/utils/browserDispatchTruth.ts'), 'utf8')
  .replace(/\s+/g, ' ');

/**
 * The case body, bounded at the next block-opening case so it cannot leak into a
 * neighbour. `max` must exceed the longest reply string in the case (the
 * capabilities reply is long) or the trailing flag assignments are cut off.
 */
function caseBody(intent: string, max = 1200): string {
  const label = serverFlat.indexOf(`case '${intent}':`);
  expect(label, `${intent} case missing`).toBeGreaterThan(-1);
  // Fall-through labels (`case 'volume_down':` after `case 'volume_up':`) share a
  // single block, so start at the block opener and bound at the next `case 'x': {`.
  const blockOpen = serverFlat.indexOf('{', label);
  expect(blockOpen, `${intent} case has no block`).toBeGreaterThan(-1);
  const rest = serverFlat.slice(blockOpen + 1);
  const nextMatch = /case '[a-z_]+': \{/.exec(rest);
  const end = nextMatch ? blockOpen + 1 + nextMatch.index : serverFlat.length;
  return serverFlat.slice(label, Math.min(end, label + max));
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

describe('a browser display capture without a decoded frame is not a capture', () => {
  it('refuses to credit a frame when the video reports no dimensions', () => {
    const verdict = browserCaptureVerdict(0, 0, 'Screen 1');
    expect(verdict.captured).toBe(false);
    expect(verdict.width).toBeNull();
    expect(verdict.height).toBeNull();
    expect(verdict.detailEn).toMatch(/no decoded frame/i);
  });

  it('still credits a real decoded frame at its true dimensions', () => {
    const verdict = browserCaptureVerdict(1920, 1080, 'Screen 1');
    expect(verdict.captured).toBe(true);
    expect(verdict.width).toBe(1920);
    expect(verdict.height).toBe(1080);
    expect(verdict.detailEn).toContain('1920x1080');
  });

  it('does not substitute a placeholder size when only one dimension is missing', () => {
    expect(browserCaptureVerdict(1920, 0).captured).toBe(false);
    expect(browserCaptureVerdict(0, 1080).captured).toBe(false);
  });

  it('the ScreenshotModal routes its live capture through the verdict, not a 1280x720 fallback', () => {
    const modalFlat = fs
      .readFileSync(path.resolve(process.cwd(), 'src/components/ScreenshotModal.tsx'), 'utf8')
      .replace(/\s+/g, ' ');
    expect(modalFlat).toContain('browserCaptureVerdict(');
    expect(modalFlat).not.toContain('video.videoWidth || 1280');
    expect(modalFlat).not.toContain('video.videoHeight || 720');
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
    // The in-app Browser disclosures are emitted by the browser truth helper
    // (`server.ts` delegates the reply to it), so the guard reads both layers.
    const dispatchLayer = serverFlat + ' ' + browserTruthFlat;
    for (const marker of [
      'No external phone dialer was opened.',
      'No external calculator application was opened.',
      'No external Paint application was opened.',
      'No external Chrome process was started.',
      'No external browser was launched.',
    ]) {
      expect(dispatchLayer, marker).toContain(marker);
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

describe('the offline engine discloses work it did not perform', () => {
  const memory = {
    name: '',
    notes: [],
    customKeyValues: {},
    stats: { totalCommands: 0, actionsExecuted: 0, lastActive: '2026-09-01T00:00:00.000Z' },
  } as any;

  it('opens Location Services (in-app action) but does not claim a GPS fix', () => {
    const result = processOfflineCommand('where am I location', memory, 'en-US');
    expect(result.intent).toBe('location_services');
    expect(result.actionExecuted).toBe(true);
    expect(result.actionDetail?.type).toBe('location_services');
    expect(result.reply).toMatch(/did not acquire a GPS fix/i);
    expect(result.reply).not.toMatch(/orbital/i);
  });

  it('hands a search query to the in-app Browser without claiming results', () => {
    const result = processOfflineCommand('search for quantum computing', memory, 'en-US');
    expect(result.intent).toBe('google_search');
    expect(result.actionExecuted).toBe(true);
    expect(result.reply).toMatch(/no results were retrieved/i);
    expect(result.reply).toContain('quantum computing');
  });

  it('opens the VM telemetry panel without claiming a live read', () => {
    const result = processOfflineCommand('server status telemetry', memory, 'en-US');
    expect(result.intent).toBe('cloud_telemetry');
    expect(result.actionExecuted).toBe(true);
    expect(result.reply).toMatch(/no live metrics were read/i);
  });

  it('opens the Freelance Pipeline without claiming a quotation was generated', () => {
    const result = processOfflineCommand('generate freelance quotation', memory, 'en-US');
    expect(result.intent).toBe('generate_quotation');
    expect(result.actionExecuted).toBe(true);
    expect(result.reply).toMatch(/no new quotation was generated/i);
  });

  it('opens the Social Media Console without claiming a post was published', () => {
    const result = processOfflineCommand('draft linkedin social post', memory, 'en-US');
    expect(result.intent).toBe('create_social_post');
    expect(result.actionExecuted).toBe(true);
    expect(result.reply).toMatch(/no post was generated or published/i);
  });

  it('no longer contains the retired fake-success strings', () => {
    for (const retired of [
      'Searching Google for',
      'Accessing Geolocation API and orbital positioning telemetry',
      'Displaying Oracle Cloud Always Free ARM VM Telemetry',
      'Generating freelance quotation proposal',
      'Launching Social Media Generator & Approval Matrix',
    ]) {
      expect(engineFlat, retired).not.toContain(retired);
    }
  });
});

describe('the /api/chat cloud_telemetry case asserts neither a plan nor a live read it did not make', () => {
  it('gates the live-read sentence on an actual live metrics source', () => {
    const body = caseBody('cloud_telemetry');
    expect(body).toContain('No live host metrics source is connected');
    expect(body).toContain('describeBillingCost(oracleCloudState.billingEntitlement)');
    expect(body).not.toContain('Oracle Always Free ARM VM');
    expect(body).not.toContain('Metrics are read live from the daemon host.');
  });
});


describe('the /api/chat informational cases do not count a question as executed work', () => {
  // A look-up or capability answer runs no tool and opens no view: `handleExecuteAction`
  // in App.tsx has no case for any of these intents, so they must report
  // `actionExecuted: false` and must not advance the "Autonomous Actions Executed"
  // counter. The offline engine already reports false for the same intents; the live
  // route previously disagreed and marked each as a performed action.
  it('get_name reports the stored name without crediting an action', () => {
    const body = caseBody('get_name');
    expect(body).toContain('actionExecuted = false;');
    expect(body).not.toContain('actionExecuted = true;');
    expect(body).toContain('informational, no action taken');
  });

  it('capabilities_inquiry lists capabilities without crediting an action', () => {
    const body = caseBody('capabilities_inquiry', 2200);
    expect(body).toContain('actionExecuted = false;');
    expect(body).not.toContain('actionExecuted = true;');
    expect(body).toContain('informational, no action taken');
  });

  it('system_diagnostic reports measured values without crediting a probe', () => {
    const body = caseBody('system_diagnostic');
    expect(body).toContain('actionExecuted = false;');
    expect(body).not.toContain('actionExecuted = true;');
    expect(body).toContain('informational, no probe run');
  });

  it('time_inquiry reports the clock without crediting an action', () => {
    const body = caseBody('time_inquiry');
    expect(body).toContain('actionExecuted = false;');
    expect(body).not.toContain('actionExecuted = true;');
    expect(body).toContain('informational, no action taken');
  });

  it('the offline engine reports the clock without crediting an action either', () => {
    // The offline twin of the case above; `handleExecuteAction` routes the intent
    // only to a view switch, so neither surface may credit the read as work.
    const idx = engineFlat.indexOf("intent: 'time_inquiry'");
    expect(idx, 'offline time_inquiry branch missing').toBeGreaterThan(-1);
    const branch = engineFlat.slice(idx, idx + 800);
    expect(branch).toContain('actionExecuted: false');
    expect(branch).not.toContain('actionExecuted: true');
    expect(branch).toContain('informational, no action taken');
  });
});

describe('a blocked finance request is a refusal, not executed work', () => {
  // The safety protocol rejects financial operations. The /api/chat case and the
  // offline job declared `actionExecuted = true` and titled the action "Finance
  // Blocked", advancing the "Autonomous Actions Executed" counter for work the
  // assistant refused to do. App.tsx has no `finance_blocked` case, so no view
  // opens either. Refusing must report false on both surfaces.
  it('the /api/chat finance_blocked case credits no executed action', () => {
    const body = caseBody('finance_blocked');
    expect(body).toContain('actionExecuted = false;');
    expect(body).not.toContain('actionExecuted = true;');
    expect(body).toContain('no action taken');
  });

  it('the offline finance guard returns actionExecuted false and does not advance the counter', () => {
    const memory = {
      name: 'Gahonsh',
      notes: [],
      customKeyValues: {},
      stats: { totalCommands: 5, actionsExecuted: 2, lastActive: new Date().toISOString() },
    } as any;
    const result = processOfflineCommand('please send money to my landlord', memory, 'en-US');
    expect(result.intent).toBe('finance_blocked');
    expect(result.actionExecuted).toBe(false);
    // The counter is the user-visible "Autonomous Actions Executed" figure.
    expect(memory.stats.actionsExecuted).toBe(2);
  });

  it('the engine finance guard source states the refusal explicitly', () => {
    expect(engineFlat).toContain(
      "actionDetail: { type: 'finance_blocked', title: 'Finance Blocked (safety exclusion, no action taken)' }",
    );
  });
});

describe('a fetch-only YouTube summarization is not credited as executed work', () => {
  // `summarizeYouTubeVideoCore` returns `success: true` as soon as the video
  // metadata is fetched, even when the video exposes no transcript and no
  // description and the resulting summary is empty (`source: 'none'`). The
  // /api/chat case gated `actionExecuted` on `summaryRes.success` alone, so a
  // summarization that produced nothing still advanced the user-visible
  // "Autonomous Actions Executed" counter. Only a non-empty summary is work.
  it('the /api/chat summarize_youtube_video case gates success on a non-empty summary', () => {
    const body = caseBody('summarize_youtube_video', 3000);
    expect(body).toContain('const hasSummary = Boolean(summaryRes.summary && summaryRes.summary.trim());');
    expect(body).toContain('actionExecuted = hasSummary;');
    expect(body).not.toContain('actionExecuted = true;');
    expect(body).toContain("'youtube_summary_empty'");
  });

  it('buildYouTubeSummary reports an empty summary for a video with no content to quote', () => {
    const result = buildYouTubeSummary({
      videoInfo: {
        videoId: 'noContent1',
        url: 'https://www.youtube.com/watch?v=noContent1',
        title: 'No Content Video',
        channel: 'Test Channel',
        durationSeconds: 60,
        durationFormatted: '1:00',
        description: '',
        thumbnailUrl: '',
        hasTranscript: false,
        transcriptLength: 0,
        availableLanguages: [],
      },
      segments: [],
      transcript: '',
      description: '',
      geminiRawSummary: null,
      geminiFailed: false,
    });
    expect(result.success).toBe(true);
    expect(result.summary.trim()).toBe('');
    expect(result.source).toBe('none');
    expect(result.verificationStatus).toBe('PARTIAL');
  });
});


describe('a briefing that read no telemetry is not credited as executed work', () => {
  // With no device attached, every section of the offline briefing is a "no
  // source connected" refusal and the handler reads nothing, yet it advanced
  // the user-visible "Autonomous Actions Executed" counter unconditionally.
  const memory = {
    userName: 'Sir',
    name: 'Sir',
    customKeyValues: {},
    notes: [],
    conversationHistory: [],
    stats: { actionsExecuted: 0, tasksCompleted: 0, voiceCommands: 0 },
  } as any;

  it('does not advance the counter when no device telemetry is available', () => {
    const result = processOfflineCommand('Good morning JARVIS', memory, 'en-US');
    expect(result.intent).toBe('mobile_personal_status');
    expect(result.actionExecuted).toBe(false);
    expect(result.updatedMemory?.stats.actionsExecuted).toBe(0);
  });

  it('advances the counter only when a real telemetry section was read', () => {
    const status = {
      lastUpdated: new Date().toISOString(),
      permissions: { BATTERY_STATUS: true },
      battery: { level: 64, charging: false, temperatureC: 31, powerMode: 'Normal', statusText: 'OK', available: true, isSample: false },
    } as any;
    const result = processOfflineCommand('Good morning JARVIS', memory, 'en-US', status);
    expect(result.intent).toBe('mobile_personal_status');
    expect(result.actionExecuted).toBe(true);
    expect(result.updatedMemory?.stats.actionsExecuted).toBe(1);
  });
});

describe('a successful weather read is a status answer, not executed work', () => {
  const memory = {
    userName: 'Sir',
    name: 'Sir',
    customKeyValues: {},
    notes: [],
    conversationHistory: [],
    stats: { actionsExecuted: 0, tasksCompleted: 0, voiceCommands: 0 },
  } as any;

  it('reports the reading without advancing the counter', () => {
    const status = {
      lastUpdated: new Date().toISOString(),
      permissions: { WEATHER_LOCATION: true },
      weather: { location: 'New Delhi', temperatureC: 31, condition: 'Clear Sky', conditionHi: 'साफ', humidity: 40, windKmh: 8, feelsLikeC: 32, available: true, isSample: false },
    } as any;
    const result = processOfflineCommand('what is the weather', memory, 'en-US', status);
    expect(result.intent).toBe('weather_inquiry');
    expect(result.actionExecuted).toBe(false);
    expect(result.updatedMemory?.stats.actionsExecuted).toBe(0);
    expect(result.reply).toContain('New Delhi');
  });
});

