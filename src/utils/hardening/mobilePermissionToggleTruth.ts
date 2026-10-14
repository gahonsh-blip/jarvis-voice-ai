// HERMES JARVIS — Mobile Bridge permission-toggle write honesty (backlog item 13).
//
// The permission rows in `MobileBridgeModal.tsx` (`MARK GRANTED*` and the per-row
// `TOGGLE`) flipped the badge to `GRANTED` through `setPermState(...)` alone.
// They never called `androidBridgeEngine.updatePermission(...)`, which is the
// only path that persists the matrix and reports whether the store accepted the
// write. So a click showed a granted permission the bridge store never held, and
// the next reload silently restored the previous value. These helpers derive the
// badge from the store's echo and, on a refused write, say so instead of
// reporting the grant that was requested.

import type {
  AndroidPermissionState,
  MobilePermissionMatrix,
} from '../../types/mobileBridge';

export function permissionMatrixKey(uiKey: string): keyof MobilePermissionMatrix {
  return uiKey.toLowerCase() as keyof MobilePermissionMatrix;
}

export function nextToggleState(current: AndroidPermissionState): AndroidPermissionState {
  return current === 'GRANTED' ? 'NOT_CONFIGURED' : 'GRANTED';
}

export interface PermissionWriteOutcome {
  persisted: boolean;
  /** The store's state after the write — never the requested value when refused. */
  state: AndroidPermissionState;
  message: string | null;
}

export function permissionWriteOutcome(
  uiKey: string,
  requested: AndroidPermissionState,
  persisted: boolean,
  storeState: AndroidPermissionState
): PermissionWriteOutcome {
  if (persisted) {
    return { persisted: true, state: storeState, message: null };
  }
  return {
    persisted: false,
    state: storeState,
    message: `PERMISSION NOT SAVED — the bridge store refused the write; ${uiKey} stays at ${storeState} (requested ${requested}) and this change reverts on reload.`,
  };
}
