# HERMES JARVIS — Backlog Completion Status

Authoritative status of the 60-item backlog. A feature is only marked
`VERIFIED` when it is implemented, integrated, tested, and confirmed with real
evidence. Anything simulated or hardware-dependent is marked accordingly.

Last cycle: 2026-09-21 02:36 IST (2026-09-20 21:06 UTC) — zero-fake-success
reached the Oracle VCN **firewall** surfaces (item 13).
`oracleCloudState.firewallRules` in `server.ts` declared five ingress rules with
`active: true`, and `OracleCloudModal.tsx` drew an unconditional checkmark per
rule under a heading that read `<Lock /> Zero Accidental Ingress`. Nothing in
this process contacts the Oracle VCN, opens an inbound socket, or can observe
whether a port is reachable, so those five ticks and that heading were an
invented security claim about ports never tested. `active` is now a tri-state
observation (`boolean | null`) and every declared rule ships `active: null`
(never probed). The new pure helper `resolveFirewallRuleState()` in
`src/utils/vmTelemetryDisplay.ts` maps an observation to `OBSERVED_OPEN`,
`OBSERVED_CLOSED` or `NOT_PROBED`, and `summarizeFirewallObservation()` reports
`{ probedCount, total, verified }`. The modal renders `NOT_PROBED` as a label
rather than a tick, and the "Zero Accidental Ingress" claim now sits *behind*
`firewallSummary.verified`, which is false until every rule carries a real
observation; the heading otherwise states
`Ingress NOT_PROBED (0/5 rules observed)`. The same file also dropped four more
plausible-default fallbacks found while auditing it: `CPU LOAD (4 OCPUs)`,
`of {bootVolumeGb ?? 200} GB`, a hardcoded `Ubuntu 24.04 LTS (Minimal ARM64)`
footer (now reads the reported `os` field, or `UNKNOWN`), and the
"₹0 / Forever Free" Always Free checklist, which is now labelled
`PROGRAMME LIMITS (NOT VERIFIED FOR THIS INSTANCE)` with a note that billing
entitlement is never queried.
Evidence: `src/tests/vmTelemetryDisplay.test.ts` covers the firewall
normalisers and `src/tests/toolSurfaceTruthfulness.test.ts` grew two source
guards (22 tests in the file). Negative-validated: restoring `active: true` on
the five server rules fails the guard
`the Oracle firewall rules are not asserted active without a probe`
(1 failed | 19 passed), and restoring `active: null` passes (20/20). Gates on
`d1ae25b`: `npm run lint` (`tsc --noEmit`) exit 0, `npx vitest run` 56 files /
795 tests passed, `npm run build` exit 0 (`dist/server.cjs` 816.6 kb).

Previous cycle: 2026-09-21 02:25 IST (2026-09-20 20:55 UTC) — zero-fake-success
reached the Oracle Cloud VM surfaces (item 13).
`src/components/OracleCloudModal.tsx` rendered invented hardware readings
whenever the real `/api/oracle-cloud/status` payload was absent or partial:
the UPTIME & STATUS card printed `{vmStatus?.uptimeHours || 342} hours
continuous` (a `||`, so a genuinely measured 0 hours also became 342) under a
constant `ONLINE`; the SSH card printed `Public IP: 129.154.42.108` and
offered `ssh -i ~/.ssh/oracle_arm_key ubuntu@129.154.42.108` as a copyable
command for an address no server had reported; the header asserted a shape,
4 OCPUs, 24 GB RAM and 200 GB storage; the disk card said `of 200 GB`.
Every surface now renders the reported value through pure normalisers in the
new `src/utils/vmTelemetryDisplay.ts` (uptime, public IP, run state, clamped
0-100 percentages, non-negative GB) and falls back to an explicit `UNKNOWN` or
em dash. The SSH card no longer offers a command for an unreported address.
Evidence: `src/tests/toolSurfaceTruthfulness.test.ts` grew an Oracle-modal
block (18 tests in the file, all passing) and `src/tests/vmTelemetryDisplay.test.ts`
covers the normalisers (6 tests). Negative-validated: reintroducing
`|| 342`, `|| '129.154.42.108'` and the constant `ONLINE` fails exactly 3 of
the 18 with the fix reverted. Gates on `42cd1e0`: `npm run lint` (`tsc
--noEmit`) exit 0, `npx vitest run` 56 files / 791 tests passed, `npm run
build` exit 0.

Previous cycle: 2026-09-21 02:19 IST (2026-09-20 20:49 UTC) — zero-fake-success: the sample-data gap left
open by every earlier slot is now closed end to end (item 13). The offline
intent engine `processOfflineCommand()` in `src/utils/localJarvisEngine.ts`
gated each mobile section on `available` alone, while
`compileMobileStatusData()` in `src/utils/mobileStatusEngine.ts` returns
placeholder fixtures flagged `isSample: true` that still carry
`available: true` (battery 91%, 7 notifications, 4 events, 9 emails). A
sample-flagged section was therefore spoken as a measurement; the engine now
also gates on `isSample`, so a fixture can never be narrated as a reading.
The same file had already been edited this slot to read weather from
`mobileStatus?.weather` instead of the fixed 27C / 48% / 'New Delhi'
constants (verified: no `New Delhi` or `27` temperature literal remains on
the command path). Evidence: `npx vitest run src/tests/localJarvisEngine.test.ts`
31 of 32 passed before the last assertion was corrected; the offending test
asserted the sample counts must be absent from the spoken text, but
`generateMorningBriefing()` deliberately speaks them while labelling them
("2 sample notifications, including 1 priority alerts (sample data, not read
from this device)"), so the test was rewritten to assert the real invariant —
the counts appear only inside a sample label. It now passes. Negative
validation: with the `isSample` gate reverted to `true`, the test fails with
`expected 'Good morning...Device battery is at 91%...You have 7 priority
notifications...' not to match /91%|27C|7 priority|4 events|9/` — that is
the fake section being spoken as real, so the guard is load-bearing. Fix
restored immediately (`grep -c "isSample !== true"` = 5). Also in this slot
the briefing card badge in `src/components/MobilePersonalStatusModal.tsx`
unconditionally read "Real-Time Generated Telemetry" even when
`statusData.isSample`; it now reads "Generated from sample fixtures" or
"Generated from live telemetry reads". Gates observed on tip
`dbd3385` (committed 2026-09-20 20:49 UTC): lint exit 0, vitest 55 files / 781 tests passed, build exit 0
(`dist/server.cjs` 835675 bytes). Per the honesty rules this stays `PARTIAL`:
the audit is still pattern- and test-driven, not a per-tool proof, and no
physical Android device was present, so the live-telemetry branch is
unexercised.

Previous cycle: 2026-09-21 02:10 IST — Android notification privacy (item 4) was
re-audited after the 2026-09-21 01:05 IST slot left `sensitiveFilteringEnabled` as an
owner-controllable switch. That change was wrong and has been reverted in
substance: with filtering off, `handleIncomingNotification()` stored the raw
body in `pendingEvent.rawText` and called `notifyListeners(pendingMsg)`, so a
raw OTP, bank or credential body would have been held in memory and pushed to
every registered bridge listener — contradicting the absolute "never read
aloud, never written to logs" guarantee in `docs/MOBILE_CALL_NOTIFICATION.md`.
No UI or API ever exposed that field, so it was not a feature; it was a footgun
reachable only by a persisted localStorage value or a direct call. The
redaction guard in `src/utils/androidBridgeEngine.ts` is now unconditional
again (no settings gate), and the never-documented `sensitiveFilteringEnabled`
field is removed from `AndroidBridgeSettings` /
`DEFAULT_BRIDGE_SETTINGS` in `src/types/mobileBridge.ts`, so a legacy persisted
`false` is ignored rather than silently disabling the guard. The remaining
privacy toggle, `blockHealthNotificationsByDefault` (default `true`), is kept
because it only *widens* what is announced and defaults to blocking.
Guarded by `src/tests/androidBridgePrivacySettings.test.ts` (5 tests), both new
assertions negative-validated: neutralising the health gate fails the health
test, and re-introducing the settings gate fails the legacy-override test.

Previous cycle: 2026-09-21 01:40 IST — zero-fake-success audit reached the host
telemetry (item 13). `getHostCpuUsagePercent()` in
`src/utils/hardening/hostTelemetry.ts` read `os.cpuUsage`, which is not a Node
API on any runtime we can observe (`os.cpuUsage === undefined` on node
v22.23.2), so that branch was dead code and every CPU reading came from the
load-average proxy. That proxy divided the 1-minute load average by the core
count and was never clamped, so a busy/oversubscribed host produced an
arithmetically impossible utilisation — a real `npx vitest run` of
`src/tests/hostTelemetry.test.ts` observed `expected 107 to be less than or
equal to 100`. The HUD (`HUDHeader.tsx`), the Oracle Cloud modal and the spoken
briefing all render this number as a live fact, so the fix reports a saturated
host as 100% and removes the dead detection path; `clampCpuPercent()` is
exported and covered. Guarded by two new assertions in
`src/tests/hostTelemetry.test.ts` (8 tests total, negative-validated: reverting
the clamp fails `expected 107 to be 100`).

Still open before item 13 can return to `VERIFIED`: the sweep is text- and
pattern-driven, so it can only prove the *audited* strings are gone. The
`SAMPLE_*` fixtures in `mobileStatusEngine.ts` are still sample data rendered
through `compileMobileStatusData`, and the UI consumes them without a
"sample data" label — that is an honesty gap, not yet fixed. A tool-by-tool
inventory of the remaining surfaces has not been completed.

Previous cycle: 2026-09-21 01:05 IST — zero-fake-success audit widened to the UI and
sample data (item 13). Two more hardcoded claims removed:
`SecurityMatrixModal.tsx` always rendered `Security Matrix Status: 100%
Operational` in its footer even when `/api/security` had never answered — it now
renders the fetched level or states that the state is unavailable;
`mobileStatusEngine.ts` `SAMPLE_NOTIFICATIONS` carried a Gmail entry asserting
`Always Free ARM VM health check: 100% nominal uptime`, an invented monitoring
result now reworded as a maintenance notice. Also, in the same cycle, the
offline intent engine `src/utils/localJarvisEngine.ts` was found to report state
it never measured, and fixed: the `mobile_personal_status` briefing defaulted
all permissions to `true` and every reading to a plausible constant (78% battery,
27°C, 5 notifications, 3 events, 2 emails) so a briefing with no phone attached
looked measured; the dedicated weather inquiry answered 27°C / 48% / `New Delhi`
with no weather provider wired up; and the `how are you` intent answered
`All systems nominal. Ready to assist.` while performing no health check. The
briefing now defaults permissions to `false`, the fields are nullable and the
briefing says no phone is connected; the weather inquiry returns
`actionExecuted: false` with an explicit "no weather source is connected"; the
`how are you` intent says it cannot health-check itself. Four assertions that
pinned the old fabricated strings were rewritten to assert the honest replies
(`localJarvisEngine.test.ts`, `conversationalPipelineRegression.test.ts`,
`voiceAndHindiModes.test.ts`) and `src/tests/toolSurfaceTruthfulness.test.ts`
gained five guards over the engine source. Negative-validated: restoring
`temperatureC ?? 27` makes the telemetry guard fail; restored after.

Still open before item 13 can return to `VERIFIED`: the sweep is text- and
pattern-driven, so it can only prove the *audited* strings are gone. The
`SAMPLE_*` fixtures in `mobileStatusEngine.ts` are still sample data rendered
through `compileMobileStatusData`, and the UI consumes them without a
"sample data" label — that is an honesty gap, not yet fixed. A tool-by-tool
inventory of the remaining surfaces has not been completed.

Previous cycle: 2026-09-21 00:15 IST — zero-fake-success audit widened to the intent
handlers and the scheduler (item 13). Four more fabricated-success surfaces were
found and fixed in `server.ts`: `find_document` (both Telegram and voice paths)
answered *every* query with a hardcoded `/workspace/storage/documents/<query>`
path, an invented `42.5 KB` size and a made-up summary; the 09:00 IST morning
briefing hardcoded `Cloud nodes on Oracle Always Free ARM VM are 100% nominal`,
`2 leads` and `1 draft`; `schedule_morning_report` claimed phone delivery
whether or not a Telegram chat was linked; `generate_quotation` and the voice
`create_social_post` claimed to have produced artifacts that were never
created. `find_document` now uses the new `realFsSearch()` in `server_tools.ts`,
which walks the workspace and returns real relative paths and byte sizes or an
explicit "not found"/"unavailable" answer. Guarded by
`src/tests/documentSearchTruthfulness.test.ts` (4 tests, negative-validated:
3 of 4 fail with the fix reverted).

Previous cycle: 2026-09-20 23:55 UTC — second secret-redaction leak sweep (item 54).
A live probe of the shared redactor (`src/utils/computerOperator/credentialRedactor.ts`)
found six more token families passing through `redactSecrets` byte-for-byte:
Google OAuth client secrets (`GOCSPX-`), Discord bot tokens, GitLab access tokens
(`glpat-`), DigitalOcean personal access tokens (`dop_v1_`), labelled AWS secret
access keys, and database connection-string passwords
(`scheme://user:password@host`). Because this function masks any text leaving the
system (screenshots, terminal streams, logs) and the operator chat path composes
it, each leaked family was a live exposure. Patterns 17-22 were added, plus an
optional `replacer` hook so a connection string masks only the password and keeps
the scheme/user/host. `src/tests/credentialRedactor.test.ts` grew from 15 to 22
tests (7 new). Negative-validated: 6 of 22 fail against the pre-fix pattern set and
all 22 pass after. No backlog item could be advanced — every remaining
`PARTIAL`/`NOT_AVAILABLE` is blocked on hardware or third-party credentials — so
the cycle was spent on this real bug hunt, as the previous cycle was. Gates
observed on tip: lint exit 0, vitest 49 files / 731 tests passed, build exit 0.

Previous cycle: 2026-09-20 23:35 IST — git tools no longer fabricate state.
`realGitStatus`/`realGitLog`/`realGitDiff` in `server_tools.ts` returned
`success: true` on every git failure, inventing branch `main`, three commit
subjects and `"Diff tool nominal."` Fixed; the HUD, `/api/tools/git/*` and the
`git_status_tool` intent now surface UNKNOWN. Guarded by
`src/tests/gitToolsTruthfulness.test.ts` (6 tests, negative-validated). This
downgraded item 13 from `VERIFIED` to `PARTIAL` — the zero-fake-success claim
had never actually been audited repo-wide.

Earlier cycle: 2026-09-20 23:05 IST — PermissionGuard direct test coverage.
`src/utils/computerOperator/permissionGuard.ts` is the computer-operator safety
surface that all Level 1-4 decisions flow through, but it had no test that called
it directly (only indirect exercise via the engine). Added
`src/tests/permissionGuard.test.ts` (9 tests) covering the global emergency stop,
the finance-exclusion guard (`FINANCE_KEYWORDS`, English and Hindi), the
destructive-command guard, the security-bypass guard (`captcha`, `dump
credentials`, `disable antivirus`), the Level 4 human gate (including
`publish`/`broadcast`/`push --force`), safe local actions, and the
`isApprovalRequired` helper — plus the security invariant that a permanently
blocked finance action returns `requiresHumanApproval: false` and must be treated
as `BLOCKED`, never as "no approval needed". Verified the caller in
`computerOperatorEngine.ts` honours this (it branches on `allowed` first, so a
finance action becomes `BLOCKED`, not `NEEDS_APPROVAL`); no latent bug there.
Negative-validated: neutralising the `captcha` branch of the security-bypass
guard makes 1 of 9 tests fail; restoring it makes all 9 pass. No production code
was changed by this slot. Gates observed on tip: lint exit 0, vitest 49 files /
724 tests passed, build exit 0 (`dist/server.cjs`, 816,011 bytes).

Prior cycle: 2026-09-20 22:35 IST — Caller-ID masking privacy leak. There were two
`maskPhoneNumber` implementations. The one in `src/utils/telephonyPermissions.ts`
(the telephony permission/safety surface) revealed far more of the number than
its sibling: for `+91 9876543210` it returned `+9198765*****`, exposing the
country code plus eight subscriber digits, while `src/utils/androidBridgeEngine.ts`
masked the same input as `+91 ******3210`. The privacy contract documented in
`TelephonySession` is the latter form, so the leak was both a correctness bug and
a privacy exposure on any surface that logs or renders a caller ID through the
telephony permissions module. `maskPhoneNumber` now extracts the digits, keeps
only the `+NN` country prefix and the last four digits, and returns the canonical
`+91 ******3210` (blank input → `Unknown / Private`, ≤4 digits → `****`). Direct
coverage added in `src/tests/telephonyPermissions.test.ts` (24 tests) covering the
masking contract, permission/tier resolution and clinic-safety redaction.
Negative-validated on this tree by restoring the original implementation —
8 of 24 fail, including the eight-leaked-digits case. Gates observed on tip: lint
exit 0, vitest 48 files / 715 tests passed, build exit 0 (`dist/server.cjs`,
816,011 bytes).

Prior cycle: 2026-09-20 22:05 IST — Workspace path-containment fix. The file
routes in `server_tools.ts` guarded against escape with a bare string-prefix
test, `absolute.startsWith(PROJECT_ROOT)`. A string prefix is not a directory
boundary: `/workspace/project/jarvis-voice-ai-EXT` (and any sibling directory
whose name shares the root's prefix) satisfies it, so `../jarvis-voice-ai-EXT/x`
passed the guard and resolved outside the authorised workspace. `safeResolvePath`
now normalises and requires segment-wise containment (`escapesRoot`), and rejects
both traversal above the root and prefix-sibling targets. Regression test
`src/tests/workspacePathContainment.test.ts` (9 tests); negative-validated by
reverting the fix — 4 of 9 fail, including the `-EXT` sibling case and `..`
traversal. Gates observed on this tree: lint exit 0, vitest 47 files / 691 tests
passed, build exit 0.

Prior cycle: 2026-09-20 21:35 IST — HUD honesty fix. The header rendered
`TELEGRAM ONLINE` and `LEVEL 2 SAFE` as literal constants, so it asserted a live
phone link and a specific safety level regardless of backend state. Both
indicators now read `/api/telegram/status` (`config.isLiveConnected`, which
exposes only `botTokenMasked`) and `/api/security` (`currentLevel`), and render
`OFFLINE`/`UNKNOWN` when the truth is unavailable. `src/utils/hudTelemetry.ts`
plus `src/tests/hudTelemetry.test.ts` (7 tests) guard the honest-null behaviour;
negative-validated by injecting a fabricated metric value (3 of 7 tests fail).
Gates observed: lint exit 0, vitest 46 files / 682 tests passed, build exit 0.

Prior cycle: 2026-09-20 21:05 IST — Notification privacy honesty fix. Item 4 was
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
| 4 | Real Android notifications integration | `VERIFIED` (server) | Notification listener gated and replay-protected. Sensitive-content filter is now tested: `src/tests/mobileNotificationPrivacy.test.ts` (39 tests). A garbled Hindi OTP matcher that let Hindi OTP bodies through was found and fixed 2026-09-20 21:05 IST. 2026-09-21 02:10 IST: a regression introduced by the 01:05 IST slot had made the redaction guard switchable off via `sensitiveFilteringEnabled`; that was reverted (guard is unconditional, field removed) and is pinned by `src/tests/androidBridgePrivacySettings.test.ts` (5 tests), negative-validated. |
| 5 | Real Android location/GPS integration | `VERIFIED` (server) | `ACCESS_FINE_LOCATION` gating with real coordinates accepted. |
| 6 | Mobile Bridge auth/session verification | `VERIFIED` | HMAC tokens, constant-time compare, expiry, replay rejection, revocation. |
| 7 | Mobile Bridge reconnect/disconnect | `VERIFIED` (server) | Reconnect counting, idle expiry, revocation on disconnect and re-pair. |

## 🖥️ Computer control (8-13)

| # | Item | Status | Evidence |
| :--- | :--- | :--- | :--- |
| 8 | Real Windows screenshot capture | `VERIFIED` (implementation) | `screenshotStore.ts` captures via PowerShell `CopyFromScreen` on Windows, `screencapture` on macOS, `import` on Linux. The old canvas-drawn placeholder is gone. Physical Windows leg pending a Windows host. |
| 9 | Screenshot file existence/path/size verification | `VERIFIED` | `verifyScreenshotFile()` stats the file, rejects missing/empty/directory targets, parses real PNG IHDR dimensions from the bytes, and records a sha256. Covered by `screenshotStore.test.ts` (13 tests). |
| 10 | Real Computer Operator actions | `VERIFIED` (subset) | `HostActionExecutor` runs real commands, file reads/writes, test runs and captures. Synthetic mouse/keyboard input reports `NOT_AVAILABLE` with a reason rather than faking success. Covered by `hostActionExecutor.test.ts`. The file routes' workspace boundary was not actually sound until 2026-09-20 22:05 IST: `safeResolvePath` used a bare string-prefix test, so a sibling directory sharing the root's name prefix escaped the workspace. Now segment-checked (see Last cycle), guarded by `src/tests/workspacePathContainment.test.ts`. The computer-operator permission gate itself also has direct coverage now: `src/tests/permissionGuard.test.ts` (9 tests, 2026-09-20 23:05 IST) asserts the emergency-stop block, the finance exclusion, the destructive-command and security-bypass guards, the Level 4 human gate, and that a blocked action must never be read as "no approval needed". |
| 11 | Action result verification | `VERIFIED` | `ActionVerifier` no longer returns unconditional success (`|| true` removed). Clicks require an observed screen change; edits require a disk re-read; tests require parsed runner output; screenshots require a captured file. |
| 12 | Browser real-action + permission flow | `VERIFIED` | `ScreenshotModal.tsx` uses `getDisplayMedia` when permitted, otherwise asks the host to capture via `/api/computer-operator/screenshot`. A denied permission reports `permission_denied`, not a simulated image. |
| 13 | Zero-fake-success for all tools | `PARTIAL` | **2026-09-21 02:19 IST (20:49 UTC) — sample-fixture gap closed.** The `SAMPLE_*` fixtures in `mobileStatusEngine.ts` carry `available: true`, so `processOfflineCommand()`'s `available`-only gate spoke them as readings; the engine now gates on `isSample` too, and the weather path no longer falls back to 27C / 48% / 'New Delhi'. `MobilePersonalStatusModal.tsx` briefing badge no longer claims 'Real-Time Generated Telemetry' for sample data. Guarded by `src/tests/localJarvisEngine.test.ts` and `src/tests/mobileStatusEngine.test.ts` (46 tests across the two files, all passing; negative-validated: reverting the `isSample` gate makes the engine test fail with the fixture values spoken as real). Gates on `dbd3385`: lint exit 0, vitest 781/781, build exit 0. Still `PARTIAL` — the sweep is pattern-driven and no physical device exercised the live branch. **2026-09-21 01:05 IST — third widening, UI + offline intent engine.** `SecurityMatrixModal.tsx` footer hardcoded `Security Matrix Status: 100% Operational` regardless of whether `/api/security` answered; now renders the fetched level or says the state is unavailable. `mobileStatusEngine.ts` `SAMPLE_NOTIFICATIONS` asserted `Always Free ARM VM health check: 100% nominal uptime` as a notification body; reworded to a maintenance notice. `src/utils/localJarvisEngine.ts`: the `mobile_personal_status` briefing defaulted every permission to `true` and every reading to a plausible constant (78% battery, 27C, 5 notifications, 3 events, 2 emails), so a no-phone briefing looked measured; the weather inquiry answered 27C / 48% / 'New Delhi' with no provider; `how are you` answered `All systems nominal. Ready to assist.` with no health check. Fixed: permissions now default `false`, unmeasured fields are nullable and the briefing reports no phone connected, the weather inquiry returns `actionExecuted: false`, and the greeting refuses to claim health. Guarded by `src/tests/toolSurfaceTruthfulness.test.ts` (14 tests over `server.ts` and the engine source; negative-validated: restoring `temperatureC ?? 27` fails the telemetry guard and the code was restored). Four assertions pinning the old strings were rewritten (`localJarvisEngine.test.ts`, `conversationalPipelineRegression.test.ts`, `voiceAndHindiModes.test.ts`). **Still NOT `VERIFIED`** - the sweep is pattern-driven, so it shows the audited strings are gone, not that every surface is honest. Known remaining gap: the `SAMPLE_*` fixtures in `mobileStatusEngine.ts` are sample data that `compileMobileStatusData` renders as if real and the UI does not label them as samples. A tool-by-tool inventory of all surfaces is still outstanding. |  Operator path now routes through `executionTruth.ts` receipts. Hardcoded `C:\Jarvis\Screenshots` text and the invented `Tests: 141 passed` terminal line were removed. **2026-09-20 23:35 IST — the claim did not hold repo-wide:** `realGitStatus`/`realGitLog`/`realGitDiff` in `server_tools.ts` returned `success: true` on *every* git failure with invented data (branch `main`, three fabricated commit subjects, `"Diff tool nominal."`), which propagated to the Autonomous Tools HUD, `/api/tools/git/*` and the `git_status_tool` voice intent. Fixed; guarded by `src/tests/gitToolsTruthfulness.test.ts` (6 tests, negative-validated: 4 of 6 fail with the fix reverted). Remaining scope before this can return to `VERIFIED`: the same audit has not yet been run across every tool surface. **2026-09-21 02:25 IST — the Oracle Cloud VM surface.** `OracleCloudModal.tsx` invented uptime (342 h), a public IP (`129.154.42.108`), a constant `ONLINE` and static shape/disk specs whenever `/api/oracle-cloud/status` was partial or absent; all now go through `src/utils/vmTelemetryDisplay.ts` and render `UNKNOWN`/em dash when unreported. Guards: `src/tests/vmTelemetryDisplay.test.ts` (6 tests) and the Oracle block in `src/tests/toolSurfaceTruthfulness.test.ts` (18 tests in file); negative-validated, 3 of 18 fail with the fabrications restored. Gates on 42cd1e0: lint exit 0, vitest 56 files / 791 tests passed, build exit 0. **2026-09-21 02:36 IST — the Oracle VCN firewall surface.** `oracleCloudState.firewallRules` in `server.ts` declared all five ingress rules `active: true` and `OracleCloudModal.tsx` drew an unconditional tick per rule under a `<Lock /> Zero Accidental Ingress` heading — a security claim about ports nothing in this process ever probed (it never contacts the VCN). `active` is now tri-state (`boolean \| null`), every declared rule ships `active: null`, `resolveFirewallRuleState()` maps an observation to `OBSERVED_OPEN`/`OBSERVED_CLOSED`/`NOT_PROBED`, and the "Zero Accidental Ingress" text sits behind `firewallSummary.verified` (false until all rules carry a real observation); the heading otherwise reads `Ingress NOT_PROBED (0/5 rules observed)`. Four more plausible defaults in the same modal removed (`4 OCPUs`, `?? 200` GB disk, hardcoded Ubuntu footer now the reported `os`, Always Free checklist relabelled `PROGRAMME LIMITS (NOT VERIFIED FOR THIS INSTANCE)`). Guards: `src/tests/vmTelemetryDisplay.test.ts` + 2 source guards in `toolSurfaceTruthfulness.test.ts` (22 in file); negative-validated, restoring `active: true` fails exactly the firewall guard (1 failed \| 19 passed), restoring `active: null` passes 20/20. Gates on d1ae25b: lint exit 0, vitest 56 files / 795 tests passed, build exit 0 (`dist/server.cjs` 816.6 kb). |

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
| 54 | Secret/token protection audit | `PARTIAL` | Real bugs found and fixed across cycles (see below): a malformed OpenAI key regex that matched no key at all; a `.gitignore` that was UTF-16 encoded so git did not honour its `.env` line; five token families (Stripe, Slack, npm, Hugging Face, SendGrid) that passed through `redactSecrets` unchanged; HUD surfaces that asserted unverified credential/link state; and — 2026-09-20 22:35 IST — a caller-ID masking leak. `maskPhoneNumber` in `src/utils/telephonyPermissions.ts` returned `+9198765*****` for `+91 9876543210`, exposing the country code plus eight subscriber digits, while the sibling helper in `androidBridgeEngine.ts` already masked the same input as `+91 ******3210`. The telephony helper now matches that canonical `+91 ******3210` form (`src/tests/telephonyPermissions.test.ts`, 24 tests; negative-validated — 8 of 24 fail against the old implementation). `HUDHeader.tsx` no longer printed `TELEGRAM ONLINE` and `LEVEL 2 SAFE` as constants; it polls `/api/telegram/status` (which returns only `botTokenMasked`, never the raw token) and `/api/security`, rendering `OFFLINE`/`UNKNOWN` when unknown (`src/tests/hudTelemetry.test.ts`, 7 tests). `git check-ignore` confirms `.env` is ignored; the vault secret is no longer hardcoded; credential patterns are covered by `src/tests/credentialRedactor.test.ts` (22 tests). A second leak sweep on 2026-09-20 23:55 UTC found six more families that passed through unredacted (Google OAuth client secrets, Discord bot tokens, GitLab PATs, DigitalOcean tokens, labelled AWS secret keys, connection-string passwords); they are now covered. No credential rotation was performed against live providers here. |
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
8. **Six more real token families passed through redaction unchanged.** A second
   live probe of the shared `redactSecrets` (2026-09-20 23:55 UTC) found Google
   OAuth client secrets (`GOCSPX-…`), Discord bot tokens
   (`<id>.<timestamp>.<hmac>`), GitLab access tokens (`glpat-`), DigitalOcean
   personal access tokens (`dop_v1_` + 64 hex), labelled AWS secret access keys,
   and database connection-string passwords (`scheme://user:password@host`) all
   survived byte-for-byte. Because this function masks any text that leaves the
   system — screenshots, terminal streams, logs — and the operator chat path
   composes it, each was a live exposure. Patterns 17-22 were added. The
   connection-string rule uses a new optional `replacer` hook so only the
   password is masked and the scheme, user and host remain readable in a log. A
   guard test pins that ordinary dotted prose and versioned URLs are not
   over-redacted by the Discord-shaped pattern. `src/tests/credentialRedactor.test.ts`
   grew from 15 to 22 tests (7 new: 6 leak regressions plus 1 over-redaction
   guard); negative-validated — 6 of 22 fail against the pre-fix pattern set and
   all 22 pass after.

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
- A second redaction cycle (2026-09-20 23:55 UTC) again advanced no backlog item,
  for the same reason, and again spent the slot on a real bug hunt in the same
  engine: six further token families leaked unredacted and are now covered.
  Item 54 stays `PARTIAL` — the pattern scan is wider but still not a proof, and
  no live credential rotation or third-party audit was performed.
- The `server.ts` token vault reports `NOT_CONFIGURED` unless `APP_SECRET` or
  `SESSION_SECRET` is set. With no secret, tokens are encrypted under a random
  per-process key and will not survive a restart.
- Clock note, found this slot: the slot time labels written into this file in
  this window run ahead of the commit timestamps that `date` reports. The
  20:49 UTC commit of this slot is labelled `02:19 IST` above, but a commit
  that `git log` stamped `2026-09-20 20:32 UTC` is labelled `02:10 IST`
  earlier in this file, and the 20:12 UTC commit is labelled `00:15 IST` in
  `docs/CHANGELOG.md`. Labelling is therefore inconsistent by up to a couple
  of hours. No code depends on these strings; they are report metadata only.
  The `git log` timestamp is the reliable record and is what the commit SHAs
  quoted here resolve to.
- Item 13 remains `PARTIAL` even though the sample-fixture speech gap is closed.
  What is proven is that the audited surfaces no longer narrate fixtures as
  measurements; there is no exhaustive per-tool inventory, and the
  live-telemetry branch of `compileMobileStatusData()` has never run against a
  real Android device, so it is `UNVERIFIED` rather than working or broken.
