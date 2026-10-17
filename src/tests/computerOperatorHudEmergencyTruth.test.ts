import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// The Computer Operator HUD executes host actions from its own Run button and
// carries the "EMERGENCY PAUSED" banner, but App.tsx mounted it without passing
// the kill-switch state. The modal therefore fell back to its `isEmergencyStopped
// = false` default, so the HUD ran with a hardcoded "not stopped" claim and never
// rendered the emergency banner — regardless of the real switch position. The
// operator chat paths were already guarded; this guards the HUD path too.

const APP_SRC = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf8');

describe('Computer Operator HUD reflects the live kill-switch state', () => {
  it('seeds liveness as UNKNOWN rather than a fabricated released state', () => {
    expect(APP_SRC).toContain("useState<KillSwitchLiveness>('UNKNOWN')");
    // No render path may seed or force the operator HUD to a safe "released".
    expect(APP_SRC).not.toContain("useState<KillSwitchLiveness>('RELEASED')");
    expect(APP_SRC).not.toContain("useState<KillSwitchLiveness>('ENGAGED')");
  });

  it('derives the emergency flag from the shared tri-state helper', () => {
    expect(APP_SRC).toContain('isEmergencyStopped={killSwitchBlocks(killSwitchLiveness)}');
  });

  it('re-probes the switch when the operator view is opened', () => {
    expect(APP_SRC).toContain("if (activeApp === 'computer_operator') refreshKillSwitch()");
    expect(APP_SRC).toContain('const liveness = await fetchKillSwitchState()');
  });

  it('fails closed: a probe that never answers stays UNKNOWN and blocks', () => {
    // The state starts UNKNOWN and is only replaced by an awaited server answer,
    // so an unreachable /api/emergency/status keeps killSwitchBlocks() true.
    expect(APP_SRC).toContain("const [killSwitchLiveness, setKillSwitchLiveness] = useState<KillSwitchLiveness>('UNKNOWN')");
    expect(APP_SRC).toContain('setKillSwitchLiveness(liveness)');
  });
});
