// ==============================================================================
// HERMES JARVIS — Blueprint deliverable-toggle honesty (backlog item 13)
//
// `POST /api/blueprint/toggle-item` flipped a deliverable's `done` flag on the
// in-process `BLUEPRINT_PHASES` constant and answered `{ success: true }`
// unconditionally. Two false-success shapes followed:
//
//   • the tick was never durable. The phases array is a module constant and was
//     never written to `jarvis_memory.json`, so a restart silently restored the
//     archived checklist — the operator's tick vanished while the response had
//     reported it saved;
//   • a malformed request (a `phaseId` no phase has, or an `itemIndex` outside
//     the deliverable list) reached the array indexer and either did nothing or
//     touched `undefined`, yet the route still answered `{ success: true }`.
//
// The blueprint is the surface that reports readiness progress, so a tick that
// was not stored must not read as a stored tick. This module classifies the
// request and applies the toggle to a given phase list; the route persists the
// result and answers only for a change that is durable.
// ==============================================================================

export interface BlueprintDeliverable {
  text: string;
  done: boolean;
}

export interface BlueprintPhase {
  id: number;
  code: string;
  titleEn: string;
  titleHi: string;
  status: string;
  icon: string;
  cost: string;
  description: string;
  deliverables: BlueprintDeliverable[];
  commandSample: string;
}

export type BlueprintToggleVerdict =
  | {
      applied: true;
      phase: BlueprintPhase;
      phaseId: number;
      itemIndex: number;
      /** The deliverable state after the toggle. */
      done: boolean;
    }
  | {
      applied: false;
      reason: 'INVALID_PHASE' | 'INVALID_INDEX';
      message: string;
    };

/** True for a non-negative integer (array index), rejecting floats and NaN. */
function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

/**
 * Flip one deliverable on the phase with `phaseId` and recompute the phase
 * status. Returns an explicit verdict instead of mutating on a malformed body:
 * an unknown phase or an out-of-range index is refused, never reported as a
 * successful toggle. Mutates `phases` in place and returns the changed phase.
 */
export function applyBlueprintToggle(
  phases: BlueprintPhase[],
  phaseId: unknown,
  itemIndex: unknown
): BlueprintToggleVerdict {
  const phase = phases.find((p) => p.id === phaseId);
  if (!phase) {
    return {
      applied: false,
      reason: 'INVALID_PHASE',
      message: `No blueprint phase has id ${String(phaseId)}; nothing was changed.`,
    };
  }
  if (!isIndex(itemIndex) || !phase.deliverables[itemIndex]) {
    return {
      applied: false,
      reason: 'INVALID_INDEX',
      message: `Phase ${phase.id} has no deliverable at index ${String(itemIndex)}; nothing was changed.`,
    };
  }

  phase.deliverables[itemIndex].done = !phase.deliverables[itemIndex].done;
  const allDone = phase.deliverables.every((d) => d.done);
  phase.status = allDone ? 'completed' : 'in_progress';

  return {
    applied: true,
    phase,
    phaseId: phase.id,
    itemIndex,
    done: phase.deliverables[itemIndex].done,
  };
}

/**
 * Deep-clone a phase list. The route holds the live list; the persisted copy
 * must not alias it, or a later in-memory edit would mutate the stored record
 * before it is written.
 */
export function cloneBlueprintPhases(phases: BlueprintPhase[]): BlueprintPhase[] {
  return phases.map((p) => ({ ...p, deliverables: p.deliverables.map((d) => ({ ...d })) }));
}

/**
 * Rebuild the live phase list from the archived design, overlaying any operator
 * tick state that was persisted. Titles, icons and costs stay authoritative in
 * the design constant; only the operator-mutable fields (`done`, `status`) are
 * taken from the stored copy. A persisted entry that no longer matches a design
 * phase is ignored rather than resurrected.
 */
export function overlayPersistedPhases(
  design: BlueprintPhase[],
  persisted: unknown
): BlueprintPhase[] {
  const base = cloneBlueprintPhases(design);
  if (!Array.isArray(persisted)) return base;

  const stored = new Map<number, BlueprintPhase>();
  for (const entry of persisted) {
    if (entry && typeof entry === 'object' && typeof (entry as BlueprintPhase).id === 'number') {
      stored.set((entry as BlueprintPhase).id, entry as BlueprintPhase);
    }
  }

  for (const phase of base) {
    const saved = stored.get(phase.id);
    if (!saved || !Array.isArray(saved.deliverables)) continue;
    phase.deliverables = phase.deliverables.map((d, i) => {
      const savedItem = saved.deliverables[i];
      return savedItem && typeof savedItem.done === 'boolean' ? { ...d, done: savedItem.done } : d;
    });
    if (typeof saved.status === 'string') phase.status = saved.status;
  }
  return base;
}
