import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// server.ts binds a port on import, so the route assertions read the source
// text, matching the convention in launchDispatchTruth.test.ts.
const serverFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8')
  .replace(/\s+/g, ' ');

const appFlat = fs
  .readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8')
  .replace(/\s+/g, ' ');

/** Case labels `handleExecuteAction` in App.tsx routes to a view or a tool. */
const APP_HANDLED = new Set(
  [...appFlat.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]),
);

/**
 * Every intent that hard-codes `actionExecuted = true;` in `server.ts`, with the
 * real work that justifies the flag. This is the item-13 sweep, made durable:
 * each entry was audited by reading the case body, not inferred from the name.
 *
 *  - `view`   — the intent opens a real in-app view (`App.tsx` has a case).
 *  - `tool`   — the case runs a real host tool (git, filesystem, web, search).
 *  - `memory` — the case performs a real persisted write.
 *
 * `set_name` is no longer listed: the executed flag now follows the durable
 * write outcome (`actionExecuted = persisted;`), so it is not a literal
 * `actionExecuted = true;` site. Its conditional form is pinned below.
 */
const AUDITED_TRUE_SITES: Record<string, 'view' | 'tool' | 'memory'> = {
  open_computer_operator: 'view',
  git_status_tool: 'view', // also runs realGitStatus()
  tools_audit: 'view',
  pending_approvals: 'view',
  check_project: 'view', // also runs realGitStatus()
  create_social_post: 'view',
  find_document: 'tool', // realFsSearch() with >=1 match; no view opens
  generate_quotation: 'view',
  security_audit: 'view',
  telephony_hub: 'view',
  call_history: 'view',
  open_calculator: 'view',
  open_paint: 'view',
  open_chrome: 'view',
  open_chatgpt: 'view',
  morning_briefing: 'view',
  language_switch: 'view',
  math_computation: 'view', // also evaluates the expression
};

/** Walks `server.ts` and pairs each literal `actionExecuted = true;` with its case. */
function literalTrueSites(): { intent: string; body: string }[] {
  const flat = serverFlat;
  const labelRe = /case '([a-z_]+)': \{/g;
  const sites: { intent: string; body: string }[] = [];
  let m: RegExpExecArray | null;
  const labels: { intent: string; at: number }[] = [];
  while ((m = labelRe.exec(flat)) !== null) labels.push({ intent: m[1], at: m.index });
  for (const { intent, at } of labels) {
    const nextLabel = labels.find((l) => l.at > at);
    const end = nextLabel ? nextLabel.at : flat.length;
    const body = flat.slice(at, end);
    if (body.includes('actionExecuted = true;')) sites.push({ intent, body });
  }
  return sites;
}

describe('item 13 — the actionExecuted = true sweep is enumerated and pinned', () => {
  const sites = literalTrueSites();

  it('every literal true site belongs to a distinct, audited intent', () => {
    const intents = sites.map((s) => s.intent);
    expect(intents).toEqual(Object.keys(AUDITED_TRUE_SITES));
    // A repeated label would mean a fall-through block, which would make the
    // per-case body slicing above unsound.
    expect(new Set(intents).size).toBe(intents.length);
  });

  it('each view-backed site is actually routed by the app dispatcher', () => {
    for (const [intent, kind] of Object.entries(AUDITED_TRUE_SITES)) {
      if (kind !== 'view') continue;
      expect(APP_HANDLED.has(intent), `${intent} is not routed by App.tsx`).toBe(true);
    }
  });

  it('the non-view site justifies the flag with real host work', () => {
    const findDoc = sites.find((s) => s.intent === 'find_document')!;
    // find_document only counts when a real search returned matches.
    expect(findDoc.body).toContain('realFsSearch(');
    expect(findDoc.body).toContain('search.success && search.matches');
  });

  it('set_name credits execution only after a name is really persisted', () => {
    // set_name is conditional now, so it is not a literal-true site; the flag
    // must follow the durable write result rather than a bare `true`.
    const label = serverFlat.indexOf("case 'set_name': {");
    expect(label).toBeGreaterThan(-1);
    const end = serverFlat.indexOf("case 'get_name':", label);
    const body = serverFlat.slice(label, end);
    expect(body).toContain('memoryState.name = verdict.name');
    expect(body).toContain('persistMemory();');
    expect(body).toContain('actionExecuted = persisted;');
    expect(body).not.toContain('actionExecuted = true;');
  });

  it('no case sets the flag unconditionally (a bare assignment with no guard)', () => {
    // A case whose body is only the assignment (and no condition, tool call,
    // view route, or persist) would be the original fake-success shape. Every
    // audited site must instead be justified by either a routed view or a
    // visible piece of real work inside the case body.
    for (const { intent, body } of sites) {
      const kind = AUDITED_TRUE_SITES[intent];
      const justifiedByWork =
        /\b(if|await|realGitStatus|realFsSearch|realFsList|realWebFetch|toolActionExecuted|captureScreenshot|verdict|persistMemory|toLocale|new Date)\b/.test(
          body,
        );
      const justifiedByView = kind === 'view' && APP_HANDLED.has(intent);
      expect(
        justifiedByView || justifiedByWork,
        `${intent} credits execution with no observable work`,
      ).toBe(true);
    }
  });
});
