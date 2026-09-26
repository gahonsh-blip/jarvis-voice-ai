import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { launchVerdict, launchReply } from '../utils/computerOperator/launchDispatchTruth';

// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in telephonyDispatchTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const NO_DISPLAY = {
  LAUNCH_APP: { available: false, reason: 'Requires a desktop session to launch applications.' },
  INSPECT_SCREEN: { available: false, reason: 'No display server.' },
};

const WITH_DISPLAY = {
  LAUNCH_APP: { available: true },
  INSPECT_SCREEN: { available: true },
};

function receipt(outcome: string) {
  return {
    action: 'LAUNCH_APP',
    target: 'code',
    outcome,
    detailEn: `executor said ${outcome}`,
    verified: outcome === 'VERIFIED',
  } as any;
}

describe('a headless host never confirms an application launch', () => {
  it('reports NO_DISPLAY_SESSION and does not set actionExecuted', () => {
    const verdict = launchVerdict('Visual Studio Code', NO_DISPLAY, null);
    expect(verdict.outcome).toBe('NO_DISPLAY_SESSION');
    expect(verdict.actionExecuted).toBe(false);
    expect(verdict.title).toMatch(/Not Executed/);
  });

  it('never speaks a foreground claim for a headless host', () => {
    const verdict = launchVerdict('Google Chrome', NO_DISPLAY, null);
    expect(launchReply('Google Chrome', verdict, 'en-US')).not.toMatch(/foreground|now in the/i);
  });

  it('never says VS Code was brought to the foreground when unconfirmed', () => {
    const verdict = launchVerdict('Visual Studio Code', WITH_DISPLAY, receipt('DISPATCHED'));
    expect(verdict.actionExecuted).toBe(false);
    expect(verdict.outcome).toBe('DISPATCHED_AWAITING_OBSERVATION');
    expect(launchReply('Visual Studio Code', verdict, 'en-US')).not.toMatch(/active foreground|brought to/i);
  });
});

describe('only an independently observed foreground is a confirmed launch', () => {
  it('confirms the launch when the executor observed the app in the foreground', () => {
    const verdict = launchVerdict('Visual Studio Code', WITH_DISPLAY, receipt('VERIFIED'));
    expect(verdict.outcome).toBe('FOREGROUND_CONFIRMED');
    expect(verdict.actionExecuted).toBe(true);
    expect(launchReply('Visual Studio Code', verdict, 'en-US')).toMatch(/foreground/);
  });

  it('reports a failed launch as failed and not executed', () => {
    const verdict = launchVerdict('Google Chrome', WITH_DISPLAY, receipt('FAILED'));
    expect(verdict.outcome).toBe('FAILED');
    expect(verdict.actionExecuted).toBe(false);
  });

  it('reports a blocked launch as blocked', () => {
    const verdict = launchVerdict('Google Chrome', WITH_DISPLAY, receipt('PERMISSION_REQUIRED'));
    expect(verdict.outcome).toBe('BLOCKED');
    expect(verdict.actionExecuted).toBe(false);
  });

  it('treats a missing receipt as unverified, never as success', () => {
    const verdict = launchVerdict('Terminal', WITH_DISPLAY, null);
    expect(verdict.outcome).toBe('UNVERIFIED');
    expect(verdict.actionExecuted).toBe(false);
  });
});

describe('the /api/chat launch intents route through the real executor', () => {
  it('no launch case hardcodes actionExecuted = true', () => {
    for (const intent of ['operate_vscode', 'operate_browser', 'operate_terminal']) {
      const caseStart = serverFlat.indexOf(`case '${intent}': {`);
      expect(caseStart, `${intent} case missing`).toBeGreaterThan(-1);
      // Bound the body at the next case so the slice cannot leak into a
      // neighbouring case and mask a hardcoded success.
      const nextCase = serverFlat.indexOf("case '", caseStart + 1);
      const caseBody = serverFlat.slice(caseStart, nextCase === -1 ? caseStart + 600 : nextCase);
      expect(caseBody).toContain('evaluateLaunchDispatch');
      expect(caseBody).toContain('verdict.actionExecuted');
      expect(caseBody).not.toContain('actionExecuted = true;');
    }
  });

  it('the launch verdict helper consults the host capability map before executing', () => {
    const helperStart = serverFlat.indexOf('async function evaluateLaunchDispatch');
    expect(helperStart).toBeGreaterThan(-1);
    const helper = serverFlat.slice(helperStart, helperStart + 700);
    expect(helper).toContain('hostActionCapabilities()');
    expect(helper).toContain('hostActionExecutor.execute');
  });
});

describe('offline browser engine does not claim OS-level launches', () => {
  const engine = fs
    .readFileSync(path.resolve(process.cwd(), 'src/utils/localJarvisEngine.ts'), 'utf8')
    .replace(/\s+/g, ' ');

  it('does not claim VS Code reached the active foreground offline', () => {
    expect(engine).not.toContain('brought to active foreground');
  });

  it('does not claim PowerShell or Chrome launched offline', () => {
    expect(engine).not.toContain('PowerShell console activated');
    expect(engine).not.toContain('Chrome browser window');
  });

  it('does not claim Notepad, Calculator or Paint launched offline', () => {
    expect(engine).not.toContain('Opening Notepad.');
    expect(engine).not.toContain('Opening Calculator tool.');
    expect(engine).not.toContain('Opening Paint canvas.');
    expect(engine).not.toContain('Paint canvas open ho raha hai');
  });

  it('every offline app-launch reply disclaims the real desktop application', () => {
    for (const marker of [
      'Offline mode does not open a real Notepad application.',
      'Offline mode does not open a real desktop Calculator application.',
      'Offline mode does not open a real desktop Paint application.',
    ]) {
      expect(engine, marker).toContain(marker);
    }
  });
});
