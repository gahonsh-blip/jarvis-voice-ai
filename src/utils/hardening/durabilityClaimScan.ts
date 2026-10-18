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
// Slot 5 found two further holes in the same guard:
//   * `sliceRoutes` only matched the single-quoted single-path form, so a route
//     declared as an array (`app.post(['/a', '/b'], ...)`) was not a slice at all
//     and its body escaped the scan; and
//   * the writer exemption matched the *call* rather than its *use*, so a route
//     that called `persistMemory()` and then discarded the boolean while
//     forwarding some unrelated flag (`persisted: someOtherFlag`) was exempted.
// Both are closed here, and both are pinned by negative-validated cases in
// `durabilityClaimInvariant.test.ts`.
//
// Slot 11 (2026-10-19 03:35 IST) found the claim vocabulary itself still short.
// `applied` is the same false-success claim as `persisted` — a route that answers
// `applied: true` for a change whose write could be refused tells the caller the
// mutation took effect when the store may still hold the previous value — and
// six mutating routes in `server.ts` make it (`/api/blueprint/toggle-item`,
// `/api/freelance/update-status`, `/api/social/youtube/update-draft`,
// `/api/security/update`, `/api/telephony/settings`, `/api/telephony/permissions`).
// Five are already backed; `/api/telephony/permissions` forwards
// `result.applied` from `applyPhonePermissionUpdate()`, which reads the store
// back before reporting, so it is backed too — the writer allowlist simply did
// not name it. The vocabulary now includes `applied` and the allowlist names
// that writer, so the class is pinned rather than merely unguarded.
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

const ROUTE_RE = /app\.(get|post|put|delete|patch)\(\s*(?:'([^']+)'|\[([^\]]*)\])/g;

// The keys that assert durability. `persisted` is the canonical one; `recorded`
// and `stored` are the same claim under a different name and were the ones the
// literal-only guard missed. `applied` is the same claim on the mutation path —
// "the change took effect" — and was added in slot 11 of the 2026-10-18 window.
const CLAIM_KEY = 'persisted|recorded|stored|applied';

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

// Durability-aware writers. A route that *consumes* one of their return values is
// reporting a computed verdict, not asserting success. `persistMemory()` is the
// canonical writer; the rest wrap it or read the row back from disk.
//
// Slot 9 (2026-10-19 02:05 IST) found this list stale: four repaired routes that
// *do* consume a durability verdict were still flagged once the refusal exemption
// below was tightened — `persistBlueprintPhases` (`/api/blueprint/toggle-item`),
// `persistScheduledGoals` (`/api/autonomous/schedule`), `persistSecurityMatrixState`
// (`/api/security/update`) and `persistTelephonySettingsState` (`/api/telephony/settings`)
// each write and consume a verdict the list did not name. `testPlatformConnection`
// is included because it returns `profilePersisted` derived from `persistMemory()`,
// so the verify route forwards a computed verdict rather than asserting one.
//
// Slot 11 (2026-10-19 03:35 IST): `applyPhonePermissionUpdate` is added for the
// same reason � it reads the permission store back and reports `applied: false`
// when the store does not hold the write, so `/api/telephony/permissions`
// forwards a computed verdict. Without it the newly-widened `applied` claim
// vocabulary flagged that route as unbacked when it is in fact the repaired one.
const DURABILITY_WRITER_CALL_RE =
  /(?:await\s+)?(?:persistMemory|persistBlueprintPhases|persistScheduledGoals|persistSecurityMatrixState|persistTelephonySettingsState|persistApprovalRegistry|persistEmergencyState|persistTelephonyCalls|recordDurableAuditRow|recordNightlyRun|recordScheduledGoalRun|recordSchedulerOutcome|recordAudit|recordBridgeAuthFailure|addAuditLog|executeApprovedAction|testPlatformConnection|applyPhonePermissionUpdate|writeFileSync|writeFile)\s*\(/g;

// A writer call whose verdict is thrown away cannot back a claim. The test is
// positional: a call is *discarded* only when it sits in statement position,
// i.e. the last non-space character before it closes a block or statement
// (`{`, `}`, `;`, or the start of the slice). Anywhere else — `x = writer()`,
// `return writer()`, `if (!writer())`, `a && writer()` — the verdict is
// consumed and may be forwarded honestly. Matching the call alone is not
// enough: `persistMemory(); res.json({ persisted: someFlag })` calls the writer
// but still asserts a value it never computed, which is the defect item 13
// exists to remove.
function hasConsumedWriter(body: string): boolean {
  DURABILITY_WRITER_CALL_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DURABILITY_WRITER_CALL_RE.exec(body)) !== null) {
    const before = body.slice(0, m.index).replace(/\s+$/, '');
    const last = before.slice(-1);
    if (last !== '' && last !== '{' && last !== '}' && last !== ';') return true;
  }
  return false;
}

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
    // Single-path form carries the path in group 2. The array form
    // (`app.get(['/a', '/b'], ...)`) carries a quoted list in group 3; joining it
    // with ` | ` keeps one route as one slice instead of dropping it, so a
    // mutating route declared only in array form cannot escape the scan.
    let path = m[2];
    if (path === undefined && m[3] !== undefined) {
      const parts = [...m[3].matchAll(/'([^']+)'/g)].map((p) => p[1]);
      path = parts.length === 1 ? parts[0] : parts.join(' | ');
    }
    matches.push({ index: m.index, method: m[1].toUpperCase(), path: path ?? '' });
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

    const literalTrue = values.some((v) => v === 'true');
    const consumedWriter = hasConsumedWriter(route.body);

    // A read-back of the persisted state backs any claim: the route asked disk.
    if (READ_BACK_RE.test(route.body)) continue;

    // Slot 9 (2026-10-19 02:05 IST): the refusal exemption used to be body-wide,
    // so a route that hard-coded `persisted: true` in one branch was cleared by
    // any unrelated `persisted: false` elsewhere in the same body — the exact
    // shape of `/api/social/platforms/test`, which answered `persisted: true`
    // whenever the probe's `profilePersisted` was not `false`, including for a
    // `NOT_CONFIGURED`/`ERROR` probe that persisted nothing. A refusal now backs
    // a claim only when the route also *consumes* a durability-aware writer, i.e.
    // the refusal is the other branch of a verdict the route actually computed.
    if (literalTrue) {
      if (consumedWriter && REFUSAL_RE.test(route.body)) continue;
    } else if (consumedWriter) {
      continue;
    }

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
