# HERMES JARVIS — Autonomous Window Log

Durable, append-only record of the nightly autonomous development window
(21:00 → 05:00 IST). Each 30-minute slot appends one section. **Never overwrite
history** — this file is the memory that makes the next slot smarter, alongside
`automation/hermes-state` (branch `automation/hermes-state`).

Format per slot:

```
## <UTC ISO8601> — slot <n>/16 (<WORK|FINALIZATION>)

- Item worked: #<n> <title>
- Status: <VERIFIED|PARTIAL|...>
- Tests: <observed counts or NOT RUN>
- Commit: <sha>  Push: <ok|failed>
- Notes / blockers:
```

---

## 2026-09-20T05:45Z — setup (not a scheduled slot)

- Installed the automation definition `HERMES JARVIS Autonomous Nightly Window`
  with cron `05,35 21-23,0-4 * * *` (Asia/Kolkata) and a 1800s run cap.
- Why slots: the automation platform rejects any `timeout` above 1800 seconds
  (`timeout must not exceed 1800 seconds (30 minutes)`, HTTP 422), so the
  eight-hour window is 16 sequential 30-minute runs rather than one long run.
- The 04:35 IST slot is the finalization slot (final verify → push → PR →
  PR opened → human approval required → deploy verification → report).
- Item worked: none (setup only)
- Status: NOT_STARTED
- Tests: NOT RUN
- Commit: —  Push: —

## 2026-09-20T05:55Z — HUMAN POLICY CORRECTION (not a scheduled slot)

- The first version of this prompt authorized an automated merge to `main` once
  a checklist of green gates passed. This **violated the owner's explicit
  policy**, which reserves the `main` merge for a human decision made after
  reading the final verification report. Green checks are not consent.
- Action taken by the human-side operator:
  - `automation/hermes-autonomous-window-prompt.md` step 5 rewritten: the
    automation may open/refresh the PR and must stop there. It reports
    `Main merge: NOT MERGED — awaiting human approval`.
  - The deployed automation `HERMES JARVIS Autonomous Nightly Window`
    (`87f65356-3a69-4cf5-aa04-82523f7d1b94`) was **disabled**. It can be
    re-enabled via `automation/deploy-hermes-window.sh` once the corrected
    prompt is intended for use.
- Reason recorded here so a future slot does not "helpfully" reintroduce the
  merge step.

## 2026-09-20T06:20Z — slot 1 (WORK, manual verification dispatch)

- Item worked: #54 Secret/token protection audit (remains `PARTIAL`; this slot
  closed four real redaction gaps, not the whole item)
- Status: PARTIAL
- What landed (commit `70439da`):
  - `src/utils/computerOperator/credentialRedactor.ts`: added Stripe, Slack,
    npm, Hugging Face and SendGrid token patterns.
  - `src/utils/computerOperatorEngine.ts`: its private `redactSecrets` now runs
    the engine's broad legacy pattern and then defers to the shared credential
    engine, so the operator path is a superset instead of a second, diverging
    implementation.
- Tests: `credentialRedactor.test.ts` +39 lines, `computerOperatorEngine.test.ts`
  +14 lines
- Docs: `docs/COMPLETION_STATUS.md`, `docs/SECURITY.md`
- Commit: `70439da` → `70952e5`  Push: ok (origin/feature/hermes-full-completion)
- Slot outcome: the run was **killed by the 1800s platform cap** during the
  push phase and reported FAILED, but the push had already completed. The cut
  happened after the push, before the report — exactly the failure mode the
  prompt warns about.

### Independent re-verification by the deploying agent (same day)

Not trusting the killed run's claims, the deploying agent re-ran the gates on
commit `70952e5` from a clean checkout:

| Gate | Command | Observed result |
| :--- | :--- | :--- |
| Lint | `npm run lint` | exit 0 |
| Tests | `npx vitest run` | **43 files passed (43), 630 tests passed (630)** |
| Build | `npm run build` | exit 0, `dist/server.cjs` = 812,364 bytes |

The run's claim of "43 files / 630 tests" is therefore independently confirmed.
- Notes / blockers: the run overran its budget. The prompt already caps work at
  ~17 minutes and reserves ~5 for the report; the observed overrun came from
  `npm ci` on a cold cache plus a long test suite. The prompt's Phase A.6 now
  installs dependencies explicitly and up front so the budget is spent on work,
  not on an untracked dependency install.

## 2026-09-20T06:40Z — conflict resolution (not a scheduled slot)

- Two branches diverged on this file: the human policy correction (`f94be0f`,
  removing automated merge-to-main) and the deploying agent's cap-hardening
  commit (`2c771df`). Both are additive history, so they were merged by hand
  rather than one overwriting the other.
- Policy now in force: **the automation never merges to `main`.** It opens a
  conflict-free, non-draft PR with the observed gate results and reports
  `Main merge: NOT MERGED — awaiting human approval`.
- The deploying agent accepts this correction. The merge step it authored was
  wrong: the owner's text authorized an autonomous merge, but a standing
  repository instruction already reserved the `main` merge for a human decision
  after reading the report, and the narrower human policy governs.

---

## 2026-09-20T06:40Z — automation re-deployed with the corrected policy

- New automation: `HERMES JARVIS Autonomous Nightly Window`
  **`a0cfd035-8712-4e75-b81a-3458a7ff4f41`**, enabled.
  - cron `05,35 21-23,0-4 * * *`, timezone `Asia/Kolkata`, timeout `1800`.
  - repos: `https://github.com/gahonsh-blip/jarvis-voice-ai`.
  - Prompt verified to contain the no-merge rule at deploy time.
- The superseded, disabled definition `87f65356-...` was deleted so only one
  window automation exists.
- Why a new id and not a PATCH: `PATCH /api/automation/v1/{id}` can change
  `name`, `trigger`, `enabled` and `timeout`, but **not** the prompt. Changing a
  prompt requires re-creating the automation.

### Known overlap — a human decision

`HERMES JARVIS Nightly Continuation Engineer` (`0455e7b3-f648-4378-a2e7-ff0b443ec850`,
cron `30 23 * * *` IST, enabled) already works this same repository and branch,
and its 23:30 IST start overlaps this window's 23:05 slot until the 23:35 kill.

- Both write `feature/hermes-full-completion`. Pushes are plain (never
  `--force`), so a collision fails the later push rather than destroying work,
  and the slot reports it honestly.
- The overlap is ~5 minutes wide and Low impact, but it is duplicated work and a
  wasted slot if one run loses the race.
- This was **left as-is**: disabling the user's other automation is their
  decision, not this agent's. Flagged in the morning report instead.
  Options for the owner: shift this window's schedule to avoid `23:30`
  (e.g. `05,35 21-22,0-4 * * *`), or disable one of the two.


---

## 2026-09-20 21:05 IST — WORK slot 2/16

- **Slot:** WORK (scheduled fire `05 21 * * *` IST). Window date 2026-09-20.
- **Selected item:** #4 Real Android notifications integration (server-side
  privacy filter). Item was already `VERIFIED (server)`; this slot found and
  fixed a real defect in that filter and gave it direct coverage.

### Completed
- **#4** — Fixed a garbled Hindi OTP matcher in
  `src/utils/mobileNotificationPrivacy.ts`. The pattern decodes to garbled
  Devanagari (not `OTP`), so a Hindi OTP notification was **not** classified as
  sensitive and its body could be exposed through the bridge. The matcher is
  corrected and the alternate variant added. Evidence:
  `src/tests/mobileNotificationPrivacy.test.ts` (39 tests) — the Hindi-OTP test
  is **negative-validated** (reverting the matcher fails it).
- Removed a dead ternary in `exposeNotificationContent` (clarity only;
  behaviour identical for non-empty previews).

### Repo hygiene
- A prior local commit had been made on a branch created from `main`, not from
  `origin/feature/hermes-full-completion`. Rebased it onto the correct branch so
  the window's 18 prior commits are intact, then pushed (fast-forward
  `6361d9d..9076368`). No force-push, no history rewrite.

### Observed gates
- `npm run lint` (tsc --noEmit): exit 0, no output.
- `npx vitest run`: **45 files / 675 tests passed**, exit 0.
- `npm run build`: exit 0; `dist/server.cjs` 815,749 bytes.

### Blocked (unchanged from slot 1)
- #1, #2, #50, #55 — physical Android device. #8 — Windows host.

### Next slot
- #14 GitHub automation, or the next non-`VERIFIED` item per the mandated order.

---

## Slot — 2026-09-20 21:35 IST (WORK)

**Item:** #54 Secret/token protection audit (HUD honesty slice) — PARTIAL

This slot continued the honesty audit of surfaces that assert unverified state.
The completion-status doc already records the credential-redaction work; what
remained was the HUD asserting state it had not checked.

**Found:** `src/components/HUDHeader.tsx` rendered the literal strings
`TELEGRAM ONLINE` and `LEVEL 2 SAFE` as constants, independent of any backend
response. The header therefore claimed a live phone link and a specific safety
level even when `isLiveConnected` was false or the security level differed.

**Fixed:** both indicators now poll the real endpoints —
`/api/telegram/status` (`config.isLiveConnected`) and `/api/security`
(`currentLevel`) — and render `TELEGRAM OFFLINE`/`TELEGRAM UNKNOWN` and
`LEVEL <n>`/`UNKNOWN` when the truth is not available. Raw bot tokens are not
exposed: the endpoint returns `botTokenMasked` only.

**Negative validation:** injected fabrication into `toMetric()` (returning 14.8
instead of null for invalid metrics) and observed 3 of 7 tests fail, then
restored. The test guards the honest-null behaviour, not just the happy path.

**Evidence:** `src/utils/hudTelemetry.ts`, `src/components/HUDHeader.tsx`,
`src/tests/hudTelemetry.test.ts` (7 tests).
**Gates:** lint (tsc --noEmit) exit 0 · vitest 46 files / 682 tests passed ·
build exit 0, `dist/server.cjs` emitted.
**Security:** `git check-ignore -v .env` → `.gitignore:4:.env`; working tree clean.
**Not verified:** the browser-side indicator rendering was not exercised in a
real browser here (no DOM run); only the parsing/formatting logic is unit-tested.
No credential rotation was performed against live providers.
