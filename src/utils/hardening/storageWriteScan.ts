// ==============================================================================
// Backlog item 13 — "zero fake success": the client storage-write invariant.
//
// `durabilityClaimScan.ts` pins the durability-claim property for the mutating
// routes in `server.ts`. The other half of item 13 is the browser storage
// layer: a writer that calls `localStorage.setItem(...)` and reports success
// without reading the bytes back cannot tell a durable write from a silently
// dropped one. A store that accepts `setItem` without throwing yet keeps the
// previous bytes — private browsing, a frozen store, a quota-clamped store —
// leaves the operator reading a change the next reload silently reverts.
//
// Every writer in this repository has been repaired to read back, but one
// surface at a time (the telephony, notification-privacy, mobile-status,
// operator, bridge, offline-storage and permission writers were each fixed in
// its own slot, pinned by its own test). Nothing pinned the *property*, so the
// next writer that does `setItem(...); return true;` would pass every existing
// test — the same blind spot `durabilityClaimScan.ts` closed for `server.ts`.
//
// This module closes it: for every `localStorage.setItem(...)` in production
// source it finds the enclosing function body and requires a read-back of the
// store after the write — either `localStorage.getItem(...)` or a `load*()`
// re-read helper (`loadOperatorTasks()`, ...). A write site with no read-back
// in its own function body is reported.
//
// The scanner is structural (source text) because the writers are plain
// modules whose behaviour depends on a live `localStorage`; the guard's job is
// to keep the shape honest, and the per-writer behavioural tests prove the
// shape behaves. Source is passed in rather than read here so the same function
// serves both the real-tree guard and the crafted-snippet self-check.
// ==============================================================================

export interface StorageWriteSite {
  file: string;
  /** 1-based line number of the `setItem` call. */
  line: number;
  /** Best-effort name of the enclosing function, for the report. */
  fn: string;
  /** The key expression passed as the first argument, when literal-ish. */
  key: string;
}

export interface StorageWriteViolation extends StorageWriteSite {
  reason: string;
}

const SET_ITEM_RE = /localStorage\s*\.\s*setItem\s*\(/g;
const GET_ITEM_RE = /\.\s*getItem\s*\(/;
// A re-load helper (`loadOperatorTasks()`) reads the store back through its own
// `getItem`; accepting it keeps the guard from flagging a writer that delegates
// its read-back instead of inlining `getItem`.
const LOAD_HELPER_RE = /\bload[A-Z][A-Za-z0-9_]*\s*\(/;

/**
 * Blank out comments, string / template literals, and regex literals while
 * preserving byte length and newlines, so brace matching and line numbers stay
 * true. Delimiters are blanked too, so a brace or an apostrophe inside any of
 * them cannot unbalance the scan. The caller reads keys from the original
 * source using the same indices.
 *
 * Regex literals must be recognised, not just strings: an apostrophe inside a
 * character-class-free regex (`/\bdon't share\b/i`) would otherwise open a
 * phantom string and blank the rest of the file — which is exactly how the
 * first version of this scanner missed the two writers in
 * `mobileNotificationPrivacy.ts`.
 */
function blankNonCode(src: string): string {
  const out = src.split('');
  const n = src.length;
  // Whether a `/` at position `i` opens a regex rather than a division. A regex
  // can only follow an operator or a keyword that expects an expression.
  const regexAllowedAfter = (i: number): boolean => {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 0) return true;
    const prev = src[j];
    if ('([{,;:!&|?+-*%^~<>='.includes(prev)) return true;
    if (prev === '}' || prev === ')' || prev === ']') return false;
    const word = src.slice(0, j + 1).match(/[A-Za-z0-9_$]+$/)?.[0] ?? '';
    return ['return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'instanceof', 'do', 'else', 'yield', 'await', 'throw'].includes(word);
  };

  let i = 0;
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') out[i++] = ' ';
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      out[i++] = ' ';
      out[i++] = ' ';
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < n) {
        out[i++] = ' ';
        out[i++] = ' ';
      }
      continue;
    }
    if (c === '/' && regexAllowedAfter(i)) {
      out[i++] = ' ';
      let inClass = false;
      while (i < n && (inClass || src[i] !== '/')) {
        if (src[i] === '\\') {
          out[i++] = ' ';
          if (i < n) {
            if (src[i] !== '\n') out[i] = ' ';
            i++;
          }
          continue;
        }
        if (src[i] === '[') inClass = true;
        else if (src[i] === ']') inClass = false;
        if (src[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < n) out[i++] = ' ';
      // Flags (i, g, m, s, u, y) trail the closing slash; blank them too.
      while (i < n && /[a-z]/.test(src[i])) out[i++] = ' ';
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const quote = c;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\') {
          out[i++] = ' ';
          if (i < n) {
            if (src[i] !== '\n') out[i] = ' ';
            i++;
          }
          continue;
        }
        if (src[i] !== '\n') out[i] = ' ';
        i++;
      }
      if (i < n) out[i++] = ' ';
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Index of the `}` matching the `{` at `open`, or -1. */
function matchBrace(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * The `[start, end]` of the block of the nearest enclosing `function` / arrow
 * body that contains `index`, or `null` when the write sits at module scope.
 */
function enclosingBody(code: string, index: number): { start: number; end: number } | null {
  const starts: number[] = [];
  const re = /\bfunction\b|=>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    if (m.index >= index) break;
    starts.push(m.index);
  }
  for (let i = starts.length - 1; i >= 0; i--) {
    const brace = code.indexOf('{', starts[i]);
    if (brace === -1 || brace > index) continue;
    const end = matchBrace(code, brace);
    if (end > index) return { start: brace, end };
  }
  return null;
}

function enclosingName(code: string, index: number): string {
  const before = code.slice(0, index);
  const decl = [...before.matchAll(/(?:function\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>)/g)].pop();
  return decl ? decl[1] ?? decl[2] ?? '<anonymous>' : '<module scope>';
}

/** The first argument of the `setItem(` call starting at `index`, trimmed. */
function firstArg(source: string, index: number): string {
  const open = source.indexOf('(', index);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i).trim();
    } else if (c === ',' && depth === 1) {
      return source.slice(open + 1, i).trim();
    }
  }
  return '';
}

/** Every `localStorage.setItem(...)` site in one source file. */
export function findStorageWrites(file: string, source: string): StorageWriteSite[] {
  const code = blankNonCode(source);
  const sites: StorageWriteSite[] = [];
  SET_ITEM_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SET_ITEM_RE.exec(code)) !== null) {
    const line = source.slice(0, m.index).split('\n').length;
    sites.push({ file, line, fn: enclosingName(code, m.index), key: firstArg(source, m.index) });
  }
  return sites;
}

/**
 * Report every `setItem` site whose enclosing function never reads the store
 * back. A write that is not confirmed by a read is a claim this repository's
 * item-13 rule forbids: the caller cannot know the bytes landed.
 */
export function findUnbackedStorageWrites(
  files: Array<{ file: string; source: string }>,
): StorageWriteViolation[] {
  const violations: StorageWriteViolation[] = [];
  for (const { file, source } of files) {
    const code = blankNonCode(source);
    SET_ITEM_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SET_ITEM_RE.exec(code)) !== null) {
      const writeIndex = m.index;
      const scope = enclosingBody(code, writeIndex);
      // Search from the write to the end of its enclosing function. A writer
      // that delegates its read-back to a `load*()` helper is accepted, because
      // that helper reads the same store through its own `getItem`.
      const after = scope ? code.slice(writeIndex, scope.end) : code.slice(writeIndex);
      if (GET_ITEM_RE.test(after) || LOAD_HELPER_RE.test(after)) continue;
      const line = source.slice(0, writeIndex).split('\n').length;
      violations.push({
        file,
        line,
        fn: enclosingName(code, writeIndex),
        key: firstArg(source, writeIndex),
        reason: 'writes the store with no read-back; a silently dropped write would read as durable',
      });
    }
  }
  return violations;
}
