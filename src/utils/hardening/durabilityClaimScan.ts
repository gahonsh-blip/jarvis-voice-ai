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
// invariant: a route that makes a durability claim (`persisted` / `recorded` /
// `stored`) must be able to *back* that claim. Concretely, the route body must
// do at least one of:
//
//   1. read the value back from disk (`emergencyStateOnDisk`,
//      `actionRequestStatusOnDisk`, `diskHasAuditRow`, ...);
//   2. answer an explicit non-durable refusal (`persisted: false`, ...);
//   3. forward a value produced inside the route by a durability-aware writer
//      (`persistMemory()`, `addAuditLog()`, `recordNightlyRun()`, ...) rather
//      than asserting a constant.
//
// A route that hard-codes `persisted: true` and can only ever answer `true`
// cannot tell a durable write from a dropped one — exactly the false success
// item 13 exists to remove. A route that forwards a computed verdict (3) is not
// asserting success; it is reporting what its writer returned, so it is not a
// violation on its own.
//
// Slot 4 of this window found the first version of this guard matched only the
// literal `persisted: true`, so variable-form claims (`persisted: result.persisted`,
// `recorded: runRecorded`) and object-shorthand claims (`{ ..., persisted }`)
// escaped it entirely. This version closes that gap and strips comments first,
// so a `// ... persisted: true ...` note cannot be mistaken for a claim.
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

// The keys that assert durability. `persisted` is the canonical one; `recorded`
// and `stored` are the same claim under a different name and were the ones the
// literal-only guard missed.
const CLAIM_KEY = 'persisted|recorded|stored';

// A `key: value` property. Captures the value expression so a literal `true`
// can be told apart from a forwarded variable.
const CLAIM_VALUE_RE = new RegExp(`\\b(?:${CLAIM_KEY})\\s*:\\s*([^,}\\n]+)`, 'g');

// Object shorthand: `{ ..., persisted }` / `{ ..., recorded }`.
const CLAIM_SHORTHAND_RE = new RegExp(`[,{]\\s*(?:${CLAIM_KEY})\\s*(?=[,}])`, 'g');

// Read-back helpers that prove a specific value reached the memory file. A route
// that names one of these cannot report a claim it never confirmed.
const READ_BACK_RE = /(?:[A-Za-z]+OnDisk\(|diskHasAuditRow\()/;

// An explicit refusal of the durability claim. `persisted: false` /
// `recorded: false` in a non-2xx reply is the shape every repaired route uses.
const REFUSAL_RE = new RegExp(`(?:${CLAIM_KEY})\\s*:\\s*false`);

// Durability-aware writers. A route that forwards one of their return values is
// reporting a computed verdict, not asserting success. `persistMemory()` is the
// canonical writer; the rest wrap it or read the row back from disk.
const DURABILITY_WRITER_RE =
  /\b(?:persistMemory|recordDurableAuditRow|addAuditLog|recordNightlyRun|persistApprovalRegistry|persistEmergencyState|persistTelephonyCalls|executeApprovedAction)\s*\(/;

// Line and block comments are removed before scanning so prose about a claim
// (this file's own comments are full of `persisted: true`) is never counted.
// The lookbehind keeps `https://` URLs from being read as a comment.
const COMMENT_RE = /(?<!:)\/\/[^\n]*|\/\*[\s\S]*?\*\//g;

/** Blank out comments while preserving line count, so line numbers stay true. */
function stripComments(source: string): string {
  return source.replace(COMMENT_RE, (comment) => comment.replace(/[^\n]/g, ' '));
}

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
 * Report every mutating route that makes a durability claim it cannot back.
 * Read routes are excluded: only a mutation can be persisted.
 */
export function findUnbackedDurabilityClaims(source: string): DurabilityClaimViolation[] {
  const cleaned = stripComments(source);
  const violations: DurabilityClaimViolation[] = [];
  for (const route of sliceRoutes(cleaned)) {
    if (route.method === 'GET') continue;

    CLAIM_VALUE_RE.lastIndex = 0;
    const values = [...route.body.matchAll(CLAIM_VALUE_RE)].map((m) => m[1].trim());
    CLAIM_SHORTHAND_RE.lastIndex = 0;
    const shorthand = CLAIM_SHORTHAND_RE.test(route.body);
    if (values.length === 0 && !shorthand) continue;

    // A read-back or an explicit refusal backs any claim.
    if (READ_BACK_RE.test(route.body) || REFUSAL_RE.test(route.body)) continue;

    const literalTrue = values.some((v) => v === 'true');
    // A forwarded verdict (a variable, a property, or object shorthand) is only
    // trustworthy when the route actually calls a durability-aware writer whose
    // result it could be forwarding. A hard-coded `: true` gets no such
    // exemption: a discarded `persistMemory()` boolean must still be flagged,
    // which is the whole point of item 13.
    if (!literalTrue && DURABILITY_WRITER_RE.test(route.body)) continue;

    const rendered = [
      ...values.map((v) => `${v}`),
      ...(shorthand ? ['<shorthand>'] : []),
    ].join(', ');
    violations.push({
      method: route.method,
      path: route.path,
      line: route.line,
      reason: literalTrue
        ? `claims persisted/recorded/stored: true (${rendered}) with no read-back and no refusal path`
        : `forwards a durability claim (${rendered}) but calls no durability-aware writer to compute it`,
    });
  }
  return violations;
}
