// HERMES JARVIS — telephony permission store honesty.
//
// `GET/POST /api/telephony/permissions` read and wrote the permission matrix
// through `loadPhonePermissions` / `savePhonePermissions`
// (`src/utils/telephonyPermissions.ts`). Both short-circuit on
// `typeof window === 'undefined'`: on the server there is no `window` and no
// `localStorage`, so `loadPhonePermissions()` returned the compile-time
// defaults and `savePhonePermissions()` returned without storing anything.
//
// The POST route still answered `success: true, applied: true` and returned
// the merged object as `permissions` — but that object was a local variable.
// The next `GET` re-read the same defaults, so a permission the operator
// granted (outbound calling, recording, private-data access) was reported as
// applied and immediately forgotten. That is the worst shape of fake success
// on this surface: the operator believes a Level-4 authorization changed when
// the store never held it.
//
// This module gives the route an explicit backend decision. When a durable
// server-side store is present the update is applied and reported as applied;
// when there is no store the route reports the honest refusal and must not
// claim a change it cannot keep.

import type {
  PhonePermissionKey,
  PhonePermissionState,
} from '../../types/telephonyProvider';

export type PhonePermissionStoreOutcome = 'APPLIED' | 'NO_STORE' | 'NOTHING_TO_APPLY';

export interface PhonePermissionStoreVerdict {
  /** True only when the change was written to a store that survives the request. */
  applied: boolean;
  outcome: PhonePermissionStoreOutcome;
  /** The permissions to return to the caller — always the authoritative store view. */
  permissions: Record<PhonePermissionKey, PhonePermissionState>;
  message: string;
}

export interface PhonePermissionStore {
  load: () => Record<PhonePermissionKey, PhonePermissionState>;
  save: (perms: Record<PhonePermissionKey, PhonePermissionState>) => void;
}

/**
 * Decide how to persist a classified permission update and report exactly what
 * happened.
 *
 * `applied` is never true without a store that actually accepted the write.
 * The caller-supplied `appliedChanges` have already been validated against the
 * real definitions by `classifyPhonePermissionUpdate`, so an empty object here
 * means the request carried no real permission (the classifier refused it
 * before reaching this function).
 */
export function applyPhonePermissionUpdate(
  store: PhonePermissionStore | null | undefined,
  current: Record<PhonePermissionKey, PhonePermissionState>,
  appliedChanges: Partial<Record<PhonePermissionKey, PhonePermissionState>>,
): PhonePermissionStoreVerdict {
  const appliedKeys = Object.keys(appliedChanges) as PhonePermissionKey[];

  if (!store) {
    return {
      applied: false,
      outcome: 'NO_STORE',
      permissions: current,
      message:
        'No durable server-side permission store is configured in this environment; ' +
        'the change was not saved and the previous permissions are unchanged.',
    };
  }

  if (appliedKeys.length === 0) {
    return {
      applied: false,
      outcome: 'NOTHING_TO_APPLY',
      permissions: store.load(),
      message: 'No permission key was present in the request body; nothing was changed.',
    };
  }

  const updated = { ...current, ...appliedChanges } as Record<
    PhonePermissionKey,
    PhonePermissionState
  >;
  store.save(updated);
  return {
    applied: true,
    outcome: 'APPLIED',
    permissions: store.load(),
    message: `Applied ${appliedKeys.length} permission(s).`,
  };
}
