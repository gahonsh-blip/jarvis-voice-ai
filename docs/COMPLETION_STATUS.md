# HERMES JARVIS — Backlog Completion Status

Authoritative status of the 60-item backlog. A feature is only marked
`VERIFIED` when it is implemented, integrated, tested, and confirmed with real
evidence. Anything simulated or hardware-dependent is marked accordingly.

Last cycle: 2026-09-20 21:05 IST — Notification privacy honesty fix. Item 4 was
recorded `VERIFIED` on the strength of the *server-side* gating, but the
sensitive-content matcher itself was broken: the Hindi OTP pattern decoded to the
garbled literal `ओटगीपीप` rather than `ओटीपी`, so a Hindi OTP notification was
not classified as sensitive and its body could be exposed through the bridge.
The matcher is corrected (plus the `ओटपी` variant) and the engine now has direct
test coverage (`src/tests/mobileNotificationPrivacy.test.ts`, 39 tests) covering
sensitivity detection, app categorisation, policy resolution, identity/hashing,
content exposure and ingestion. Negative-validated: reverting the matcher makes
the Hindi-OTP test fail. A dead ternary in `exposeNotificationContent` was also
removed (clarity only; behaviour unchanged for non-empty previews). Full suite 45
files / 675 tests, clean lint, clean build.

## Status legend

| Status | Meaning |
| :--- | :--- |
| `VERIFIED` | Implemented, integrated, and confirmed by automated or real evidence. |
| `PARTIAL` | Implemented and tested, but a real-world leg remains. |
| `SIMULATION_ONLY` | Only synthetic behaviour exists. |
| `NOT_STARTED` | No implementation yet. |
| `BLOCKED` | Requires hardware, credentials or operator action. |

---

## 🔴 Most important — Android (1-7)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 1 | Real Android Mobile Bridge connection | `PARTIAL` | Authenticated pairing + capability handshake verified by `androidBridge.e2e.test.ts` (real server process). Physical device leg unverified. |
| 2 | Android → JARVIS → Server E2E test | `PARTIAL` | Full server-side chain verified E2E. Device-to-server leg needs hardware. |
| 3 | Real Android battery/status telemetry | `VERIFIED` (server) | Device-reported telemetry only; fabricated defaults removed. |
| 4 | Real Android notifications integration | `VERIFIED` (server) | Notification listener gated and replay-protected. Sensitive-content filter is now tested: `src/tests/mobileNotificationPrivacy.test.ts` (39 tests). A garbled Hindi OTP matcher that let Hindi OTP bodies through was found and fixed 2026-09-20 21:05 IST. |
| 5 | Real Android location/GPS integration | `VERIFIED` (server) | `ACCESS_FINE_LOCATION` gating with real coordinates accepted. |
| 6 | Mobile Bridge auth/session verification | `VERIFIED` | HMAC tokens, constant-time compare, expiry, replay rejection, revocation. |
| 7 | Mobile Bridge reconnect/disconnect | `VERIFIED` (server) | Reconnect counting, idle expiry, revocation on disconnect and re-pair. |

## 🖥️ Computer control (8-13)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 8 | Real Windows screenshot capture | `VERIFIED` (implementation) | `screenshotStore.ts` captures via PowerShell `CopyFromScreen` on Windows, `screencapture` on macOS, `import` on Linux. The old canvas-drawn placeholder is gone. Physical Windows leg pending a Windows host. |
| 9 | Screenshot file existence/path/size verification | `VERIFIED` | `verifyScreenshotFile()` stats the file, rejects missing/empty/directory targets, parses real PNG IHDR dimensions from the bytes, and records a sha256. Covered by `screenshotStore.test.ts` (13 tests). |
| 10 | Real Computer Operator actions | `VERIFIED` (subset) | `HostActionExecutor` runs real commands, file reads/writes, test runs and captures. Synthetic mouse/keyboard input reports `NOT_AVAILABLE` with a reason rather than faking success. Covered by `hostActionExecutor.test.ts`. |
| 11 | Action result verification | `VERIFIED` | `ActionVerifier` no longer returns unconditional success (`|| true` removed). Clicks require an observed screen change; edits require a disk re-read; tests require parsed runner output; screenshots require a captured file. |
| 12 | Browser real-action + permission flow | `VERIFIED` | `ScreenshotModal.tsx` uses `getDisplayMedia` when permitted, otherwise asks the host to capture via `/api/computer-operator/screenshot`. A denied permission reports `permission_denied`, not a simulated image. |
| 13 | Zero-fake-success for all tools | `VERIFIED` (computer control) | Operator path now routes through `executionTruth.ts` receipts. Hardcoded `C:\Jarvis\Screenshots` text and the invented `Tests: 141 passed` terminal line were removed. |

### Computer control — what is real vs. not

Real and verified on this host: terminal commands, file read/edit (with disk
re-read), test runs (with parsed pass/fail counts), screenshot capture on a
desktop host, and host window/process observation.

Not available: synthetic mouse clicks, keystrokes, scrolling and window
switching. No OS input-automation backend is wired up, so `hostActionCapabilities()`
reports those as unavailable and every layer refuses them instead of pretending.
Implementing them requires a real input backend (e.g. Windows SendInput via a
native helper); until then they are honestly `NOT_AVAILABLE`.

## 💻 Project/GitHub automation (14-24)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 14 | GitHub repository scanner | `VERIFIED` | `repoScanner.ts` lists every repository the token can reach via `/user/repos`. Live run discovered 13 repositories. |
| 15 | All-repository health check | `VERIFIED` | `scanAllRepositories` scans each repository; live run covered all 13 with 0 unreachable. Unreachable repositories are counted and named, and downgrade the sweep to `DISPATCHED`. |
| 16 | Branch/status/PR checking | `VERIFIED` | Default branch, head SHA, commit message and age, all branches, open PRs with mergeability, and unmerged-branch count. Live run reported 5 branches and 1 failing run on this repository. |
| 17 | Automatic test & build checking | `VERIFIED` | `localHealth.ts` runs the real `npm run lint` / `test` / `build` scripts and records exit codes and durations. Live lint check ran in 6.3s with exit 0. |
| 18 | Issue/error detection | `VERIFIED` | TypeScript diagnostics parsed with file/line/column/code; Vitest summaries parsed for pass/fail counts; failing CI runs classified separately from cancelled ones. Live sweep found failing CI in 3 repositories. |
| 19 | Fix-plan generation | `VERIFIED` | `buildFixPlan` derives ordered steps from real signals only. A clean repository produces an empty plan. Live plan produced 2 steps with correct risk levels. |
| 20 | Permission-based code modification | `VERIFIED` | `modifyAndPropose` refuses protected branches, refuses a checkout on `main`, and requires a human approval. The default gate denies everything. Covered by `githubAutomationWorkflow.test.ts` against a real git repository. |
| 21 | Post-fix testing | `VERIFIED` | Checks rerun against the modified workspace; a failure leaves the change uncommitted and reports `FAILED` with `POST_CHANGE_CHECKS_FAILED`. |
| 22 | Commit generation | `VERIFIED` | Commits only after approval and passing checks. The returned SHA is read back with `git rev-parse`; the test asserts the commit exists in a real repository. |
| 23 | Push/PR workflow | `VERIFIED` | Pushes only to the feature branch via `git push -u origin <branch>`. A failed push reports `FAILED`; a failed PR after a successful push reports `DISPATCHED`. Merging to the default branch is never automatic. |
| 24 | Nightly automatic repository checking | `VERIFIED` | Registered in the server scheduler at 03:00 IST. Reads-only: scans and plans, never edits. Run records persist, and `nightlyHistory` surfaces a `missedRun` flag rather than skipping the gap silently. |

### Verification notes

- The full workflow was exercised against the live GitHub API with 13 real
  repositories. The scanner's claim that `gahonsh-blip/gahonsh-finance` has
  failing CI was cross-checked against the API directly and matched
  (`startup_failure` runs on `fix/autofix/*` branches).
- An early defect was found and fixed during this cycle: `/actions/runs` returns
  an object with a `workflow_runs` array, not a bare array. The scanner now
  validates the response shape and reports a malformed body as an unreadable
  sub-read instead of silently returning an empty list.
- Cancelled workflow runs were initially counted as failures, which raised the
  plan's risk level to `MEDIUM` on the strength of a routinely cancelled run.
  They are now tracked separately as aborted runs and produce a low-risk review.
- A second defect was fixed in the outcome logic: a failed push fell through to
  `VERIFIED`. It now reports `FAILED`.

## 📱 Social media (25-29)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 25 | Social account authentication | `PARTIAL` | LinkedIn OAuth connect/callback and token storage exist and are exercised against the API. YouTube/Instagram/Facebook credential checks report `MISSING_CREDENTIALS` when unset. No live production accounts were authorised in this environment, so end-to-end auth against real accounts is unverified. |
| 26 | Real platform API integration | `PARTIAL` | LinkedIn publishes through the official REST Posts API (`/rest/posts`). A 2xx is only accepted as a post when the platform returns an identifier (`x-restli-id`/`location`). YouTube/Instagram/Facebook paths exist but have no live credentials here. |
| 27 | Draft → approval → publish workflow | `VERIFIED` | `src/utils/social/publishRetry.ts` models the state machine and rejects illegal jumps. `DRAFT → PUBLISHED` is refused, `APPROVED` requires a named approver, and `PUBLISHED` requires a provider identifier. 14 workflow unit tests. |
| 28 | Published-post verification | `VERIFIED` | The provider's own identifier is the only accepted proof. A 2xx with no identifier yields `UNVERIFIED`, never `VERIFIED`. Proven end-to-end by `socialPublish.e2e.test.ts`, which starts the real server against a mock LinkedIn. |
| 29 | Failure / retry handling | `VERIFIED` | `publishWithRetry` retries only failures it can show happened before the request was sent (5xx, rate limit, refused connection). Ambiguous and unrecognised failures — a dropped connection, a generic `fetch failed`, anything unclassified — are not retried, because the post may already exist; they report `UNVERIFIED`. 15 retry unit tests plus 7 E2E tests. |

Key honesty properties, each covered by a test:

- A confirmed post stores the platform URN and reports `VERIFIED`.
- A 2xx without a URN reports `UNVERIFIED` and the post is not marked published.
- A dropped connection reports `UNVERIFIED` and is never retried (no double post).
- An unrecognised failure also reports `UNVERIFIED` and is never retried.
- A 401/403 is not retried and reports the credential gap as `PERMISSION_REQUIRED`.
- A channel with no configured provider reports `NOT_PUBLISHED`. It no longer
  fabricates engagement metrics — the previous `Math.random()` like-counts and
  the `"broadcasted"` success message were removed.

Bugs found and fixed while building this:

- A 2xx response was initially given a synthetic `urn:li:share:${Date.now()}`
  fallback and reported as published. Any post id the platform did not supply is
  now treated as unconfirmed.
- `classifyPublishFailure` read the error code from the top-level object only.
  Node's `fetch` wraps the real cause on `error.cause`, so a dropped connection
  after send looked like an unknown error and was retried three times, which
  would double-post. The classifier now unwraps `cause` and treats a bare
  `fetch failed` as ambiguous.
- A 403 was classified as an authentication failure; it is now
  `PERMISSION`, so the recovery advice names the missing scope rather than a bad
  token.

## 📩 Communication (30-34)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 30 | Real Telegram delivery | `PARTIAL` | Delivery is now verified against Telegram's returned `message_id`. A confirmed send is `VERIFIED`; a 2xx without an id is `UNVERIFIED`; a blocked bot reports `PERMISSION_REQUIRED`. Evidence: `src/utils/communication/telegramDelivery.ts`, `src/tests/telegramDelivery.test.ts` (10 tests), `src/tests/telegramDelivery.e2e.test.ts` (3 tests against a real server with a local Telegram stand-in). The physical leg — a message reaching a real phone over api.telegram.org — still needs the operator's bot token and a real send. |
| 31 | Real notification reply | `PARTIAL` | Reply route requires an explicit `approved: true` and reports `DISPATCHED`, never success, until the device confirms. Delivery on a real handset is unverified. |
| 32 | Call detection E2E | `PARTIAL` | Call state is reported from device telemetry, and the E2E suite covers the telemetry chain. No physical call has been detected by this host. |
| 33 | Call answering | `PERMISSION_REQUIRED` | Answering is refused unless the device holds the dialer role; the refusal names the required grant. No real call has been answered. |
| 34 | Message sending with approval | `PARTIAL` | Approval gate verified server-side (`approved: true` required, kill switch honoured). Real-device delivery unverified. |

### Communication — what is real vs. not

Real: the send path, the delivery verification, the approval gate, the kill
switch, and the honest outcome vocabulary. Every one of these is exercised
against a live JARVIS process in the E2E test.

Not real: Telegram's servers and a physical Android handset. Those cannot be
reached from this host. The Telegram E2E test swaps the API host for a local
stand-in via `TELEGRAM_API_BASE_URL`, which is unset in production. A message
is only called `VERIFIED` when the real API returns a `message_id`.

## 🧠 AI / Memory (35-39)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 35 | AI Context Module | `VERIFIED` | `src/utils/memory/aiContext.ts` assembles the model context under a character budget, folding in the user name, known facts, and long-term notes. It names what it dropped (`droppedNotes`, `droppedTurns`) instead of truncating silently. 6 unit tests. |
| 36 | Long-term memory improvement | `VERIFIED` | The server memory loader no longer restores seed data when a collection was deliberately emptied. Notes, leads, audit logs, and custom keys now persist exactly as written, including when empty. Proven by restarting a real server in `memoryPersistence.e2e.test.ts`. |
| 37 | Conversation/context continuity | `VERIFIED` | The chat route keeps a bounded server-side transcript (last 40 turns). When a reloaded client sends no history, JARVIS resumes the prior thread instead of starting over. E2E covers the persistence path. |
| 38 | Online + offline memory sync | `VERIFIED` | New `POST /api/memory/sync` reconciles an offline snapshot with the server. The client flushes through it on reconnect. Notes that exist on only one side are kept, never treated as deletions. |
| 39 | Memory conflict resolution | `VERIFIED` | `src/utils/memory/memoryConflict.ts` keeps conflicting edits from both sides, prefers the newer writer only when both timestamps are known, and flags what it cannot resolve for human review. 8 unit tests plus E2E conflict cases. |

### AI / Memory — what is real vs. not

Real: context assembly, persistence across restart, conversation continuity,
offline reconciliation, and conflict detection. Every claim has a test that
runs the actual code, and the persistence claim is proven by restarting a real
server process and reading the state back.

Not real: the model itself. The unit and E2E tests cover the context plumbing,
not the quality of a Gemini response, and no live Gemini call is made in tests.

### Bugs found and fixed (AI / Memory cycle)

1. **Deleted memory came back after restart.** The loader used
   `Array.isArray(x) && x.length > 0 ? x : fallback`, so an intentionally empty
   `notes`, `socialPosts`, `auditLogs`, or `freelanceLeads` array was replaced by
   seed data. Deleting everything and restarting restored it all. Fixed with
   `coerceArray`, which distinguishes "missing" from "empty".
2. **Custom keys the user deleted reappeared.** Both the server loader and the
   browser loader spread the seed defaults under the stored copy. Removed;
   stored values now win outright.
3. **Client-side note resurrection.** The boot merge fell back to local notes
   whenever the server list was empty, and never pushed local-only notes up. Now
   the two lists are unioned by id and local-only notes are queued for sync.
4. **Stuck "SYNCING MEMORY" label.** The online handler set the syncing status
   unconditionally and returned early when the queue was empty, so the label
   never cleared. It now only claims to sync when there is work.
5. **Flush race on boot.** The offline queue was flushed in the same tick as the
   state commit, so it read pre-update local memory. The flush is deferred.

## 🤖 Autonomous agent (40-45)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 40 | Goal → Plan → Execute → Verify loop | `VERIFIED` | `src/utils/autonomous/goalRunner.ts` runs steps one at a time and requires each step's own verifier before it is `DONE`. A run ends `VERIFIED` only when every step verified. 11 unit tests. |
| 41 | Multi-step task execution | `VERIFIED` | The runner carries a shared state object between steps and stops a run when a step fails, so later steps never execute against state that was never produced. Proven end-to-end by `autonomousGoals.e2e.test.ts`, which drives real HTTP routes and then checks the filesystem independently. |
| 42 | Task recovery after failure | `VERIFIED` | Retry is opt-in per step (`retryable`, `maxAttempts`), so a non-idempotent step is never retried by default. A thrown error is captured as a step failure rather than crashing the run. Covered by the retry and throw unit tests. |
| 43 | Scheduled autonomous tasks | `VERIFIED` | `src/utils/autonomous/schedule.ts` computes due-ness in an explicit timezone and flags a missed window rather than skipping silently. The server scheduler tick runs due tasks through the same verified loop. A task marked `requiresApproval` is never run unattended — it is recorded as `PERMISSION_REQUIRED`. 10 unit tests plus 3 E2E tests. |
| 44 | Human approval checkpoints | `VERIFIED` | A step marked `requiresApproval` pauses the run when no approval channel exists, reporting `awaitingApproval` instead of assuming consent. Approval requires a named approver; an anonymous `approved: true` is not a human decision. Covered by unit and E2E tests, including that the gated file is genuinely not written. |
| 45 | Complete audit trail | `VERIFIED` | Every transition (`STEP_STARTED`, `STEP_SUCCEEDED`, `STEP_FAILED`, `STEP_RETRYING`, `STEP_SKIPPED`, `APPROVAL_REQUESTED`, `APPROVAL_DECIDED`, `RUN_FINISHED`) is recorded on the run and returned by the API. Runs are also written to the server's audit log and kept in a bounded history. |

### Autonomous agent — what is real vs. not

Real: the plan/execute/verify loop, retry policy, pauses for approval, scheduled
execution, and the audit trail. The E2E tests start a real server, call real
routes, and confirm file steps against the filesystem afterwards rather than
trusting the response body.

Bounded on purpose: the runner accepts only a fixed set of step kinds
(`fs.mkdir`, `fs.writeFile`, `fs.appendFile`, `fs.readFile`, `run.command`).
`run.command` is restricted to an allow-list (`git`, `node`, `npm`, `npx`).
A descriptor naming anything else is rejected with `BLOCKED` rather than
executed, so a request cannot smuggle arbitrary code into the runner.

### Bugs found and fixed (autonomous cycle)

1. **Unhandled rejection risk in the scheduler.** Item 43 needed the schedule
   tick to be async. An async `setInterval` callback whose promise rejects is an
   unhandled rejection, which can terminate the process. The interval now
   catches and logs.
2. **Inconsistent timezone.** Scheduled tasks originally read server-local time
   while the rest of the tick used IST, so a task could fire at the wrong hour
   on a non-IST host. The schedule maths now takes an explicit clock, and the
   endpoint reports `timezone: Asia/Kolkata`.
3. **Missing steps hidden after a failure.** A run that stopped early listed
   only the steps it had reached. The remaining steps are now returned as
   `PENDING` with a reason, so the report shows the whole plan.

## 🎙️ Voice (46-50)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 46 | Full voice system | `PARTIAL` | Text-to-speech, locale/voice selection, and speech recognition are wired and selectable in Settings. The browser speech APIs cannot run under Node, so no automated test exercises real audio output. The voice *logic* is covered; the audio path is not. |
| 47 | Continuous voice interaction | `PARTIAL` | `src/utils/voice/voiceSession.ts` implements the continuous-session state machine (`IDLE → AWAITING_WAKE → LISTENING → CONFIRMING → PROCESSING`), and the recogniser now runs in `continuous` mode with auto-restart in hands-free mode. The state machine is covered by 14 unit tests. Audio capture itself is untested here, so the loop is not claimed as end-to-end verified. |
| 48 | Voice action confirmation | `VERIFIED` | Sensitive commands are held in `CONFIRMING` and only released on a clear spoken yes. `interpretConfirmation` treats an empty reply, unrelated speech, and a mixed "yes no wait" as `UNCLEAR`, which never executes. Confirmation timeout and decline both leave the command unrun. 12 unit tests. |
| 49 | Wake Word | `VERIFIED` | `src/utils/voice/wakeWord.ts` detects the wake phrase and returns the command that followed. It matches on word boundaries, so a word merely containing "jarvis" does not trigger. Recogniser mis-hearings (`jarviz`, `jarvish`, `जार्विस`, …) are accepted; a custom wake word replaces the built-in aliases entirely. 15 unit tests. |
| 50 | Hands-free Android control | `NOT_AVAILABLE` | No Android device is attached in this environment. The wake word and confirmation logic exist and are tested, but the phone-side path cannot be demonstrated here. |

### Voice — what is real vs. not

Real and tested: wake-word detection, the continuous-session state machine, and
the confirmation gate. These are pure logic and run under the test runner.

Not verified: actual microphone capture and actual speech synthesis. The Web
Speech API is a browser feature and is absent under Node, so the audio path
cannot be exercised automatically. It is marked `PARTIAL` for that reason, not
`VERIFIED`.

Known limitation: the on-screen volume visualiser is decorative — it pulses on a
timer and is not a measurement of real input level. A comment in the code says
so, and nothing treats it as evidence.

Not available: hands-free control of a physical Android device (#50). No device
is connected to this environment.

## 🔐 Production hardening (51-60)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 51 | Complete security audit | `PARTIAL` | `src/utils/hardening/securityAudit.ts` scans tracked files and `GET /api/security/audit-secrets` runs it against the live repository. The executed run scanned 156 files and returned clean (0 CRITICAL, 0 HIGH; 2 LOW test fixtures). The audit is a pattern scan, not a proof of security, and no external penetration test was performed. |
| 52 | Permission matrix finalization | `VERIFIED` | `src/utils/hardening/permissionMatrix.ts` holds one ordered matrix that all callers share. The first matching entry wins, so a command containing both `read` and `delete` classifies as destructive. An unrecognised action is refused at level 4 and requires approval — it is never defaulted to safe. `POST /api/security/evaluate` exposes it. 19 unit tests plus E2E. |
| 53 | Kill-switch testing | `VERIFIED` | `POST /api/security/evaluate` checks the emergency stop before the level check, so an engaged kill switch blocks even a level-1 read action with category `kill_switch`. E2E toggles the switch on, asserts the block, then releases it. `isBlockedByKillSwitch` unit-tested both ways. |
| 54 | Secret/token protection audit | `PARTIAL` | Real bugs found and fixed across cycles (see below): a malformed OpenAI key regex that matched no key at all; a `.gitignore` that was UTF-16 encoded so git did not honour its `.env` line; and — this cycle — five token families (Stripe, Slack, npm, Hugging Face, SendGrid) that passed through `redactSecrets` unchanged. `git check-ignore` confirms `.env` is ignored; the vault secret is no longer hardcoded. The added patterns are covered by `src/tests/credentialRedactor.test.ts` (15 tests). No credential rotation was performed against live providers here. |
| 55 | Real-device E2E test suite | `NOT_AVAILABLE` | No Android device or Windows host is attached in this environment. The server-side legs are covered by E2E tests; the on-device checklist remains in `docs/ANDROID_BRIDGE.md`. |
| 56 | Offline-mode E2E tests | `VERIFIED` | `src/tests/offlineOnline.e2e.test.ts` boots a real server with `GEMINI_API_KEY` blanked and asserts health, memory read/write round-trip, local intent classification, a verified backup, and that permissions stay enforced offline. 6 offline tests. |
| 57 | Online-mode E2E tests | `VERIFIED` | Same file. Confirms core endpoints answer, and that each integration status endpoint with `configured: false` never reports `connected: true` or `status: connected`. 2 online tests. |
| 58 | Production deployment verification | `VERIFIED` | `src/utils/hardening/deploymentVerification.ts` + `GET /api/deployment/verify` check vault secret, production build, listening port, writable data dir, HTTPS, blocking-bug count and backup verification against this process's real state. An `UNKNOWN` check blocks readiness rather than being assumed good. Confirmed both directions: ready with a full environment, not ready with blockers named. 11 unit tests plus E2E. |
| 59 | Backup/restore procedure | `VERIFIED` | `src/utils/hardening/backupRestore.ts` + `GET /api/backup` / `POST /api/restore`. A backup is refused (HTTP 500) unless it passes its own round-trip verification. Credentials are redacted before a snapshot leaves. Restore preserves keys the backup does not mention, so an old restore never silently erases newer data. Prototype-polluting keys are rejected. 15 unit tests plus E2E. |
| 60 | Final documentation | `PARTIAL` | This document plus `docs/SECURITY.md` are current for the hardening work. Items 51, 54, 55 and 60 stay `PARTIAL`/`NOT_AVAILABLE` because the external legs (live credential rotation, physical-device hardware, third-party audit) have not been exercised. |

### Bugs found and fixed this cycle (hardening)

1. **The OpenAI key redaction pattern matched nothing.** It contained a stray
   `T3BlbkFJ` fragment inside a quantifier, so every real `sk-…` key passed
   through unredacted. A live sample key confirmed `null` before the fix. The
   pattern also carried a bare `[a-zA-Z0-9]{48,}` alternative that redacted
   ordinary commit hashes, destroying audit output. Both are gone.
2. **The Telegram token pattern never matched inside a URL.** The leading `\b`
   cannot match after `bot` in `https://api.telegram.org/bot<token>`, which is
   the only place a bot token realistically appears. Replaced with a digit
   lookbehind.
3. **`.gitignore` was UTF-16 encoded, so git ignored every line.** `git
   check-ignore .env` exited 1, meaning a real `.env` would have been committed.
   Rewritten as UTF-8; `git check-ignore` now confirms it.
4. **The token vault key was hardcoded in source.** `VAULT_SECRET` fell back to a
   literal string committed in `server.ts`, so anyone with the repository could
   decrypt stored tokens. The fallback is removed; without `APP_SECRET` the
   vault reports `NOT_CONFIGURED` and uses a random per-process key.
5. **The first secret audit reported 100 fake credentials.** It reused the broad
   redaction patterns, so every `conn.accessToken = decrypted` was reported as a
   leak, burying the real findings. Rewritten to flag only quoted literals and
   unmistakable token shapes: the same run now returns 0 CRITICAL and 0 HIGH.
6. **Five real token families passed through redaction unchanged.** A live probe
   of `redactSecrets` found Stripe secret/restricted keys (`sk_live_`,
   `rk_test_`), Slack tokens (`xoxb-`, `xoxp-`), npm tokens (`npm_`), Hugging
   Face tokens (`hf_`) and SendGrid keys (`SG.<22>.<43>`) all survived
   byte-for-byte. Because this function masks any text that leaves the system —
   screenshots, terminal streams, logs — each was a live exposure. Patterns were
   added for all five; `src/tests/credentialRedactor.test.ts` now has 6 new
   regression tests (15 total). A Twilio account SID was deliberately left
   unredacted: it is a public identifier, not a secret, and the test pins that.
7. **Two divergent redaction engines existed, and the operator chat path used
   the weaker one.** `computerOperatorEngine.ts` carried its own `redactSecrets`
   with a narrower pattern set, and `operatorChatIntegration.ts` imported that
   one to redact operator status messages. It missed all five families fixed in
   (6), so the same token would be masked in a screenshot but printed verbatim
   into a chat-rendered operator line. The engine function now composes the
   engine's legacy pattern with the shared engine's patterns, making that path a
   superset. Regression test added to `computerOperatorEngine.test.ts`.

---

## Bugs found and fixed (cycle 2 — computer control)

9. **`ActionVerifier` verified every click** — the condition ended in `|| true`, so
   `stateChangeDetected` was always true. Now a click verifies only when the
   screen actually changed.
10. **`ActionVerifier` fabricated verification for input and edits** —
   `TYPE_TEXT`, `KEY_COMBINATION`, `EDIT_FILE` and `RUN_TESTS` all returned
   `verified: true` from observation alone. All four now return `verified: false`
   with the evidence each would need.
11. **`ActionVerifier` verified unknown actions** — the `default` branch returned
   success. Unknown action types now report `Unverified`.
12. **Non-retryable actions were retried** — `EDIT_FILE`/`RUN_TESTS` would fail
   identically every attempt while the engine said "retrying". Retries are now
   limited to actions whose outcome can actually change.
13. **`ActionExecutor` returned success for work never performed** — clicks,
   keystrokes, app switches, file edits and test runs all returned
   `success: true` locally. The executor now routes to the host and passes the
   host's receipt through untouched.
14. **`ActionExecutor` printed a fixed `Tests: 141 passed`** — a hardcoded
   terminal line presented as runner output. Removed; test results now come from
   parsing the real runner.
15. **`ScreenshotModal` displayed a fake folder path** — the title read
   `[C:\Jarvis\Screenshots]` and the canvas fallback drew `FOLDER PATH:
   C:\Jarvis\Screenshots\`. Both are gone; the modal either shows a real capture
   or states plainly that nothing was captured.
16. **A denied capture permission produced a simulated image** — `getDisplayMedia`
   rejection fell through to drawing a placeholder and calling it a capture. It
   now reports `permission_denied` and shows no image.
17. **`screenObserver` invented test results** — the terminal view hardcoded
   `Tests: 141 passed (141)`. Replaced with an explicit `SIMULATION_ONLY` label.
18. **`screenObserver` presented fiction as live screen state** — the server now
   installs a host-backed observation source; the UI marks any fallback view as
   `ILLUSTRATIVE PREVIEW`.
19. **Timed-out commands leaked the whole process tree** — killing only the shell
   left grandchildren alive holding the stdout pipe, so the promise never
   settled. The executor now kills the process group and resolves on timeout.
20. **`HostActionExecutor` could not be reached by the engine** — added a
   `setExecutor` seam and installed the real executor in the server, so operator
   tasks run genuine actions rather than the browser-routing client.

## Bugs found and fixed this cycle

1. **Fabricated call answering** — `executeCallAnswer` returned `success: true`
   and "कॉल उठा ली गई है" without any device confirmation. Now returns
   `ANSWER_DISPATCHED` with `verified: false`.
2. **Fabricated message delivery** — inline replies reported `REPLY_CONFIRMED`
   with no evidence. Now `REPLY_DISPATCHED`; the app-open fallback states the
   message was not sent.
3. **Unauthenticated bridge** — every bridge endpoint trusted client-reported
   state. Now requires a paired session token.
4. **Fabricated openApplication success** — now reports dispatch only.
5. **Simulated device reported CONNECTED** — now capped at `LIMITED_CAPABILITY`.
6. **Fabricated telemetry defaults** — `/api/mobile/telemetry` returned 27°C and a
   guessed location. Replaced with device-sourced telemetry that reports
   `NOT_CONFIGURED` when absent.
7. **Rate limiter counted successful requests** — would throttle legitimate
   devices. Now counts failures only.
8. **Bridge status misclassification** — permission gaps were reported as
   hardware limits. Now `PERMISSION_REQUIRED` with the grant named.

## Bugs found and fixed (cycle 3 — infrastructure telemetry honesty)

1. **Oracle Cloud metrics were fabricated and spoken as fact** — `oracleCloudState.metrics`
   held hardcoded constants (14.8% CPU, 3.4 GB RAM, 18.2% disk, 1240 MB
   bandwidth, 38.5 °C) and `GET /api/oracle-cloud` overwrote CPU and RAM with
   `12 + Math.random() * 5` and `3.2 + Math.random() * 0.4` on every request.
   Three consumer paths repeated the fiction: the Telegram `cloud_telemetry`
   reply printed `3.4 GB / 24 GB` as a literal, and the voice engine said
   "running at {cpu}% CPU and 3.4 GB RAM". Replaced with a real host sample
   (`src/utils/hardening/hostTelemetry.ts`): CPU from `os.loadavg()` normalised
   by core count, RAM used/total/percent from `os.totalmem()`/`os.freemem()`,
   disk from `fs.statfs`. Bandwidth and temperature are not measurable from
   Node here, so they are `null` and the UI renders `—` instead of inventing a
   number. `metricsSource`/`metricsSampledAt` now record provenance, and the
   state is re-sampled at boot and per request so the modal, Telegram and voice
   paths cannot quote a stale or invented value. Verified live:
   `curl /api/oracle-cloud` returned RAM total 15.62 GiB (host truth: 16.77 GB
   `os.totalmem()`), matching the machine rather than the old `24 GB` literal.
2. **The Oracle UI masked missing data with plausible fallbacks** —
   `OracleCloudModal.tsx` used `|| 14.8` and `|| 3.4` on CPU and RAM and
   hardcoded `36.4 / 200 GB` storage with a fixed `18.2%` bar, so a failed or
   absent reading displayed a realistic-looking number. Fallbacks removed;
   missing values render as `—` with a zero-width bar.

---

## Known limitations

- No physical Android device has been used in this environment. Items 1 and 2
  remain `PARTIAL` until the on-device checklist in `docs/ANDROID_BRIDGE.md` is
  completed.
- No Windows host has been used, so item 8's PowerShell capture path is verified
  by code inspection and the headless branch is verified by test. The
  `NOT_AVAILABLE` path is what runs in this container.
- Synthetic mouse/keyboard control is not implemented (items 10/12 partly). All
  layers report `NOT_AVAILABLE` for it rather than simulating it.
- GitHub automation (items 14-24) is implemented and verified against the live
  GitHub API. It never merges into the default branch, and automated code repair
  requires a `materialize` strategy that is not shipped — plan steps without one
  report `NOT_CONFIGURED` by design.
- Social publishing (items 25-29) is honest about what it can confirm. LinkedIn
  posts are only `VERIFIED` when the platform returns a post URN; a 2xx without
  one is `UNVERIFIED`. Only the LinkedIn path has live API wiring — YouTube,
  Instagram and Facebook report `MISSING_CREDENTIALS` here, and no production
  social account was used, so items 25 and 26 stay `PARTIAL`.
- Items 30-34 (communication), 35-39 (AI/memory), 40-45 (autonomous) and
  46-50 (voice logic) are implemented and tested; their physical-device legs
  remain `PARTIAL`, as recorded in their sections above.
- Hardening (items 51-60) is complete except where hardware or an external
  party is required. Items 51, 54 and 60 stay `PARTIAL`, and item 55 stays
  `NOT_AVAILABLE`, because no third-party audit, live credential rotation, or
  physical device was available in this environment.
- The Oracle Cloud VM values in `oracleCloudState` (public IP, 4 OCPU, 24 GB
  shape, 200 GB boot volume, `uptimeHours`) are deployment metadata, not
  measurements, and remain static. Only CPU/RAM/disk are live host samples. The
  process runs in this container, not on the Oracle ARM VM, so the live figures
  describe the daemon host rather than the VM in the UI's framing — `metricsSource`
  says `live_host` to make that unambiguous. Real VM-level telemetry needs a
  request against the Oracle API with a live credential, which is not available
  here.
- The 2026-09-20 cycle advanced no new backlog item: every item is already
  implemented, and each remaining `PARTIAL`/`NOT_AVAILABLE` is blocked on a
  physical Android device, a Windows host, live third-party credentials, or an
  external auditor. The cycle was spent on a real bug hunt in the secret
  redaction engine (item 54's subject) and the fix is recorded above.
- The `server.ts` token vault reports `NOT_CONFIGURED` unless `APP_SECRET` or
  `SESSION_SECRET` is set. With no secret, tokens are encrypted under a random
  per-process key and will not survive a restart.
