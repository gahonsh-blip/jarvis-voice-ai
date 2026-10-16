// ==============================================================================
// Backlog item 13 — "zero fake success": the durability-claim invariant.
//
// The long tail of item 13 is a single repeated defect: a mutating route answers
// `persisted: true` while the write it claims can be refused without the route
// noticing. `persistMemory()` returns true without writing when the file already
// holds identical bytes, and its callers' booleans can be discarded entirely.
// The individual routes have been repaired one per slot; nothing has pinned the
// property across the whole file, so the next route added can reintroduce it
// silently.
//
// This module extracts each mutating route from `server.ts` and asserts one
// invariant: a route that claims `persisted: true` must be able to *refuse* that
// claim. Concretely, the route body must either read its state back from disk
// (`emergencyStateOnDisk`, `actionRequestStatusOnDisk`, `diskHasAuditRow`, ...)
// or answer an explicit non-durable failure (`persisted: false`). A route that
// can only ever answer `persisted: true` cannot tell a durable write from a
// dropped one — exactly the false success item 13 exists to remove.
//
// The scanner is deliberately structural (source text) because `server.ts` binds
// a port on import, so it cannot be imported by a test. `serverSource` is
// passed in rather than read here so the same function serves both the guard
// against the real file and the self-check against a crafted snippet.
// ==============================================================================

export interface RouteSlice {
  method: string;
  path: string;
  /** 1-based line number of the route registration in the source. */
  line: number;
  body: string;
}

export interface DurabilityClaimViolation {
  method: string;
  path: string;
  line: number;
  reason: string;
}

const ROUTE_RE = /app\.(get|post|put|delete|patch)\(\s*'([^']+)'/g;

// Read-back helpers that prove a specific value reached the memory file. A route
// that names one of these cannot report a claim it never confirmed.
const READ_BACK_RE = /(?:[A-Za-z]+OnDisk\(|diskHasAuditRow\()/;

// An explicit refusal of the durability claim. `persisted: false` /
// `recorded: false` in a non-2xx reply is the shape every repaired route uses.
const REFUSAL_RE = /(?:persisted|recorded):\s*false/;

/** Split the source into one slice per `app.<method>('<path>', ...)` route. */
export function sliceRoutes(source: string): RouteSlice[] {
  const matches: Array<{ index: number; method: string; path: string }> = [];
  ROUTE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ROUTE_RE.exec(source)) !== null) {
    matches.push({ index: m.index, method: m[1].toUpperCase(), path: m[2] });
  }

  return matches.map((match, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : source.length;
    const body = source.slice(match.index, end);
    const line = source.slice(0, match.index).split('\n').length;
    return { method: match.method, path: match.path, line, body };
  });
}

/**
 * Report every mutating route that claims `persisted: true` without the means to
 * refuse that claim. Read routes are excluded: only a mutation can be persisted.
 */
export function findUnbackedDurabilityClaims(source: string): DurabilityClaimViolation[] {
  const violations: DurabilityClaimViolation[] = [];
  for (const route of sliceRoutes(source)) {
    if (route.method === 'GET') continue;
    if (!route.body.includes('persisted: true')) continue;
    if (READ_BACK_RE.test(route.body) || REFUSAL_RE.test(route.body)) continue;
    violations.push({
      method: route.method,
      path: route.path,
      line: route.line,
      reason:
        'claims persisted: true but has no disk read-back and no non-durable refusal path',
    });
  }
  return violations;
}
