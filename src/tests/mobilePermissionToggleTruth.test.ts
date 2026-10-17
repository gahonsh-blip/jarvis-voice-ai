// HERMES JARVIS — Mobile Bridge permission-toggle write honesty (backlog item 13).
//
// `MARK GRANTED*` and the per-row `TOGGLE` in `MobileBridgeModal.tsx` flipped the
// badge through `setPermState(...)` alone, never calling
// `androidBridgeEngine.updatePermission(...)`. The screen therefore showed a
// GRANTED permission the bridge store never held, and the next reload silently
// restored the previous value. These tests pin the classifier that derives the
// badge from the store echo, and guard the component wiring so the
// state-only mutation cannot come back.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  permissionMatrixKey,
  nextToggleState,
  permissionWriteOutcome,
} from '../utils/hardening/mobilePermissionToggleTruth';

const SOURCE_PATH = path.resolve(__dirname, '../components/MobileBridgeModal.tsx');
const source = fs.readFileSync(SOURCE_PATH, 'utf-8');

describe('permissionWriteOutcome reports the store echo, never the requested grant', () => {
  it('accepts a persisted write and echoes the stored state', () => {
    const out = permissionWriteOutcome('NOTIFICATION_ACCESS', 'GRANTED', true, 'GRANTED');
    expect(out.persisted).toBe(true);
    expect(out.state).toBe('GRANTED');
    expect(out.message).toBeNull();
  });

  it('reverts to the stored state and warns when the store refused the write', () => {
    const out = permissionWriteOutcome('NOTIFICATION_ACCESS', 'GRANTED', false, 'NOT_CONFIGURED');
    expect(out.persisted).toBe(false);
    expect(out.state).toBe('NOT_CONFIGURED');
    expect(out.message).toContain('NOT SAVED');
    expect(out.message).toContain('NOTIFICATION_ACCESS');
  });

  it('maps the UI key to the bridge matrix key', () => {
    expect(permissionMatrixKey('NOTIFICATION_ACCESS')).toBe('notification_access');
    expect(permissionMatrixKey('CALL_ANSWER')).toBe('call_answer');
    expect(permissionMatrixKey('NOTIFICATION_HISTORY')).toBe('notification_history');
  });

  it('toggles a non-granted state to GRANTED and a GRANTED state back off', () => {
    expect(nextToggleState('NOT_CONFIGURED')).toBe('GRANTED');
    expect(nextToggleState('DENIED')).toBe('GRANTED');
    expect(nextToggleState('ASK')).toBe('GRANTED');
    expect(nextToggleState('LIMITED')).toBe('GRANTED');
    expect(nextToggleState('GRANTED')).toBe('NOT_CONFIGURED');
  });
});

describe('MobileBridgeModal permission handlers persist through the bridge engine', () => {
  it('routes both permission buttons through the persisting handlers', () => {
    expect(source).toContain("onClick={() => commitPermissionState('NOTIFICATION_ACCESS', 'GRANTED')}");
    expect(source).toContain('onClick={() => togglePermissionState(def.key)}');
  });

  it('does not set a permission badge from React state alone', () => {
    // A bare `setPermState(... GRANTED ...)` on click is the exact fake-success
    // pattern this change removed.
    expect(source).not.toMatch(/onClick=\{\(\) => \{ setPermState\(/);
  });

  it('reads the authoritative store echo when committing a permission', () => {
    expect(source).toContain('androidBridgeEngine.updatePermission(permissionMatrixKey(uiKey), requested)');
    expect(source).toContain('androidBridgeEngine.getPermissions()[permissionMatrixKey(uiKey)]');
  });
});
