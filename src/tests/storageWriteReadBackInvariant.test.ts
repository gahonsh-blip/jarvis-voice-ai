import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  findStorageWrites,
  findUnbackedStorageWrites,
} from '../utils/hardening/storageWriteScan';

// Regression guard for backlog item 13, "zero fake success" — the client
// storage half.
//
// `durabilityClaimInvariant.test.ts` pins the durability-claim property across
// the mutating routes in `server.ts`. The other half of the same defect class
// is the browser storage layer: a writer that calls `localStorage.setItem(...)`
// and reports success without reading the bytes back cannot tell a durable
// write from a silently dropped one, so the operator reads a change the next
// reload reverts. Those writers were each repaired in their own slot and pinned
// by their own behavioural test, but nothing pinned the property across the
// tree — the next writer that does `setItem(...); return true;` would pass every
// existing test. This guard closes that blind spot, mirroring
// `durabilityClaimScan.ts` for `server.ts`.
//
// It is a source-level guard because the writers depend on a live
// `localStorage`; the behavioural per-writer suites prove the repaired shape
// behaves, and this test keeps the shape from being reintroduced.

const ROOT = process.cwd();

/** Every production TypeScript source under `src/`, excluding tests. */
function productionSources(): Array<{ file: string; source: string }> {
  const out: Array<{ file: string; source: string }> = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'tests' || entry.name === 'node_modules') continue;
        walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        out.push({ file: path.relative(ROOT, full), source: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

const SOURCES = productionSources();

describe('storageWriteScan detector', () => {
  it('flags a setItem with no read-back in its enclosing function', () => {
    const source = `
      export function saveThing(thing: Thing): boolean {
        if (typeof window === 'undefined') return false;
        try {
          localStorage.setItem(THING_KEY, JSON.stringify(thing));
          return true;
        } catch {
          return false;
        }
      }
    `;
    const violations = findUnbackedStorageWrites([{ file: 'crafted.ts', source }]);
    expect(violations).toHaveLength(1);
    expect(violations[0].line).toBe(5);
    expect(violations[0].fn).toBe('saveThing');
    expect(violations[0].key).toBe('THING_KEY');
  });

  it('accepts a writer that reads the bytes back through getItem', () => {
    const source = `
      export function saveThing(thing: Thing): boolean {
        const serialized = JSON.stringify(thing);
        localStorage.setItem(THING_KEY, serialized);
        return localStorage.getItem(THING_KEY) === serialized;
      }
    `;
    expect(findUnbackedStorageWrites([{ file: 'crafted.ts', source }])).toHaveLength(0);
  });

  it('accepts a writer that delegates its read-back to a load*() helper', () => {
    const source = `
      export function saveOperatorTask(task: OperatorTask): boolean {
        localStorage.setItem(OPERATOR_TASK_KEY, JSON.stringify(task));
        return loadOperatorTasks().some((t) => t.taskId === task.taskId);
      }
    `;
    expect(findUnbackedStorageWrites([{ file: 'crafted.ts', source }])).toHaveLength(0);
  });

  it('does not let a read-back in a neighbouring function excuse the writer', () => {
    const source = `
      export function saveThing(thing: Thing): boolean {
        localStorage.setItem(THING_KEY, JSON.stringify(thing));
        return true;
      }
      export function loadThing(): Thing | null {
        const raw = localStorage.getItem(THING_KEY);
        return raw ? JSON.parse(raw) : null;
      }
    `;
    const violations = findUnbackedStorageWrites([{ file: 'crafted.ts', source }]);
    expect(violations).toHaveLength(1);
    expect(violations[0].fn).toBe('saveThing');
  });

  it('does not read a commented-out setItem as a write site', () => {
    const source = `
      export function noop(): boolean {
        // localStorage.setItem(THING_KEY, JSON.stringify(thing));
        return false;
      }
    `;
    expect(findStorageWrites('crafted.ts', source)).toHaveLength(0);
  });

  it('finds the storage writers on the real tree', () => {
    const total = SOURCES.reduce((n, s) => n + findStorageWrites(s.file, s.source).length, 0);
    // The tree has 17 production `setItem` sites today; the floor keeps the
    // scan from silently passing if the walk stops finding files.
    expect(total).toBeGreaterThanOrEqual(17);
  });

  it('no production storage writer reports a write without reading it back', () => {
    const violations = findUnbackedStorageWrites(SOURCES);
    expect(
      violations.map((v) => `${v.file}:${v.line} ${v.fn}`),
      'every localStorage.setItem must confirm the bytes landed before reporting success',
    ).toEqual([]);
  });
});
