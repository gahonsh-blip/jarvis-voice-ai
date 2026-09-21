# 📜 CHANGELOG — HERMES JARVIS

All notable improvements, security updates, and feature additions are documented in this file.

---
## [Unreleased] - 2026-09-21 22:25 IST (16:55 UTC) — Voice confirmation gate no longer reads a refusal as consent

### Security / bug fix
- `interpretConfirmation` in `src/utils/voice/voiceSession.ts` returned
  `CONFIRMED` for *prohibitions*: `मत करो` ("don't do it"), `mat karo`,
  `करो मत`, `do not do it` and `don't do it`. Each phrase was matched with a
  substring `RegExp`, so the affirmative token `करो` fired inside `मत करो`; and
  `normalise()` left `don't` intact, matching the carried-over `"don't"` negative
  entry. A clear refusal released a destructive command for execution.
- This is the same class of defect as the owner-approval parser below, in the
  voice path. Item 48 had been marked `VERIFIED`; it is corrected to `PARTIAL`.
- Fix: whole-token phrase matching (`containsPhrase`); a negation particle before
  an affirmative voids it (`NEGATIVE_PARTICLES`); the Hindi verb-final
  prohibition `करो मत` is voided by a narrow post-particle set
  (`['mat','मत']` — `ना` excluded, so `करो ना` = "please do" still confirms);
  `normalise()` rewrites `don't`/`dont` to ` not ` and `not`/`never` joined
  `NEGATIVE_PHRASES`.
- Guard: four new cases in `src/tests/voiceSession.test.ts` (25 tests in file).
  Negative-validated: reverting `src/utils/voice/voiceSession.ts` fails exactly
  the two prohibition tests (2 failed | 23 passed); all 25 pass with the fix.

---
## [Unreleased] - 2026-09-21 22:06 IST (16:36 UTC) — Owner approval parser no longer reads a refusal as consent

### Security / bug fix
- `evaluateOwnerApproval` in `src/utils/androidBridgeEngine.ts` reported
  `decision: 'APPROVE'` for Hindi *refusals* such as `कॉल मत उठाओ`
  ("don't answer the call"), `नहीं उठा`, `मत उठा` and `कॉल नहीं उठाना`. Two causes:
  the bare Devanagari verb stem `उठा` was listed as an approval keyword even
  though it occurs inside negated phrases, and Devanagari keywords were matched
  with `token.startsWith(keyword)`, which matched the stem inside longer words.
- This is a Level-4 human authorization gate input. A phrase meaning "do not do
  it" could therefore satisfy the gate that exists to prevent an unsanctioned
  external action — a trust failure worse than a missing feature.
- Fix: removed the ambiguous bare `उठा` stem (`उठा लो` replaces it), Devanagari
  keywords now require whole-token equality with no prefix fallback, and rejection
  keywords are evaluated before approval keywords so a self-contradicting phrase
  resolves to `REJECT`.
- Guard: new `describe('Owner approval parsing — negation must never grant
  consent')` block in `src/tests/androidMobileBridge.test.ts` (18 assertions
  across refusals, genuine approvals, genuine rejections, message negation, and
  that a refused call stays `AWAITING_APPROVAL`). Negative-validated: restoring
  `src/utils/androidBridgeEngine.ts` from `f3ebc8b^` fails **7** of these tests
  (`expected 'APPROVE' to be 'REJECT'`); all 35 pass with the fix restored.
  (Measured 2026-09-21 22:47 IST. An earlier figure of "2" was wrong.)

### Truthfulness / bug fix
- `GET /api/actions/audit` exposed `totalLogs: memoryState.auditLogs.length` as its
  only count, and `GET /api/system/health` exposed the same number as
  `auditLogsCount`. `jarvis_memory.json` ships 23 persisted rows with no `source`
  field, so rows carried over from a previous process were indistinguishable from
  events this process actually appended. The API contract document describes the
  audit count as evidence of actions taken, which makes an inflated count a
  correctness claim rather than a cosmetic label.
- Both endpoints now report `recordedLogs` / `recordedAuditLogs`, derived from
  `auditTrailCounts().recorded` — entries stamped `AUDIT_LOG_SOURCE_RECORDED` —
  plus `auditTrail` with a plain-language `describeAuditTrail()` summary naming
  the carried-over count explicitly. `totalLogs` is retained and documented as the
  raw array length.
- New `src/utils/hardening/auditTrailTruth.ts` (`auditTrailCounts`,
  `describeAuditTrail`, `AUDIT_LOG_SOURCE_RECORDED`) and
  `src/tests/hardening/auditTrailTruth.test.ts` (14 tests), including a cold-start
  guard that the seed array is empty.
- Negative-validated: restoring the previously seeded
  `Read Git Repository Status (Level 1)` row fails exactly 2 of 14
  (`does not seed a repository read as EXECUTED`,
  `starts a cold process with an empty audit trail`) and passes 14/14 with it
  removed.
- Gates on `3d18aa4`: `npm run lint` (`tsc --noEmit`) exit 0; `npx vitest run`
  61 files / 844 tests passed; `npm run build` exit 0 (`dist/server.cjs`
  842830 bytes / 823.1 kb).

---
## [Unreleased] - 2026-09-21 21:43 IST (16:13 UTC) — Telephony adapters no longer fabricate confirmed provider actions

### Truthfulness / bug fix
- `TelnyxTelephonyProvider` and `PlivoTelephonyProvider` in
  `src/utils/telephonyAdapters.ts` returned `startOutboundCall`
  `{ success: true, providerCallId: 'telnyx_<ts>' }` / `'plivo_<ts>'` while never
  calling their carrier API at all, and returned `transferCall`
  `{ providerConfirmed: true, success: true }` unconditionally.
- That reached a caller. `telephonySessionManager.ts` speaks *"Transferring your
  call to our clinic staff now, please hold the line."* and sets
  `handoffStatus: 'CONFIRMED'` whenever `providerConfirmed` is true, so a patient
  was told a live handoff had happened when nothing was dispatched. The
  synthesized ids also flowed into the session record as a real provider call id.
- `TwilioTelephonyProvider.transferCall` carried the same confirmed-transfer
  defect: a `<Dial>` TwiML document is an instruction that only reaches the
  carrier inside a live webhook response, but the method returned it to a caller
  that discards it. It now returns the TwiML in `raw` for a live response to use
  while keeping `providerConfirmed` false.
- All three adapters returned `getCallStatus` `{ state: 'IDLE' }`, asserting the
  call was not active when nothing had been observed. They now return `UNKNOWN`,
  added to the `TelephonyCallState` union in `src/types/telephonyProvider.ts`.
- The `/api/telephony/outbound-call` route in `server.ts` returned
  `success: true` regardless of the dispatch result; it now returns 502
  `PROVIDER_DISPATCH_FAILED` when the provider did not confirm the call.
- Guarded by `src/tests/telephonyProviderHonesty.test.ts` (6 tests).
  Negative-validated: all 6 fail with the fix reverted (`expected 'IDLE' to be
  'UNKNOWN'`; the Telnyx/Plivo assertions observe the fabricated
  `providerCallId`), all 6 pass with it. Gates on `b043386`: lint exit 0,
  vitest 60 files / 830 tests passed, build exit 0.

---
## [Unreleased] - 2026-09-21 04:06 (22:36 UTC) — Oracle instance run state and address are no longer seeded as observed facts

### Truthfulness
- `oracleCloudState` in `server.ts` seeded a constant `status: 'RUNNING'` and a
  literal `publicIp`. Both are OCI control-plane facts that this process never
  queries, and a seeded value is indistinguishable from a measurement once it
  passes through the UI normalisers — so the modal rendered an observed run state
  and offered the address as a copyable `ssh` command. Both now seed `null`.
- Added `src/utils/hardening/ociInstanceTruth.ts`. It records only what is provable
  in-process: a hostname match against the declared instance proves this process is
  *running on* that instance, which is a lower bound ("the instance is up") and is
  labelled as such. The exact lifecycle state and any public address stay
  unobserved and are named `NOT_OBSERVED` / `not observed`.
- The Telegram status reply, the `/api/oracle-cloud` integrations matrix and
  `OracleCloudModal.tsx` all render these fields through `describeRunState` /
  `describePublicIp`. `statusObservedAt` records when a status was really read.
- Removed the hardcoded `+342` hour uptime offset and the `Math.random()` jitter
  around constants (14.8% CPU, 3.4 GB RAM); `uptimeHours` is now the measured
  daemon uptime and the specs in the modal header are labelled as the declared plan.

### Testing
- `src/tests/ociInstanceTruth.test.ts` (new) plus the Oracle block in
  `src/tests/toolSurfaceTruthfulness.test.ts`: 33 tests across the two files,
  all passing. Negative-validated — restoring the literal address fails exactly
  2 tests and 33/33 pass with the fix.
- Full suite: 59 files / 824 tests passing; clean lint; clean build
  (`dist/server.cjs` 822.0 kb).

---
## [Unreleased] - 2026-09-21 03:07 (21:37 UTC) — approval and routine surfaces no longer assert unmeasured state

### 🛡️ Truthfulness
- `PermissionGateway.tsx` rendered a fixed `Payload Checksum: Verified SHA-Safe`
  badge on every approval card. Nothing hashed the payload, so the badge told a
  human approving an external action that an integrity check had passed when no
  check existed. It now renders `payloadChecksumLine(activeRequest.contentChanges)`,
  which computes an FNV-1a32 over the actual payload and labels it
  `(local integrity marker, not SHA-2)` — it does not claim cryptographic
  verification it cannot perform.
- `ProactiveRoutinesModal.tsx` hardcoded `Telegram Push Ready` and
  `Cron Scheduler: Active on Oracle ARM Node` in its footer regardless of whether
  any bot or daemon was reachable. It now reads `/api/telegram/status` and
  `/api/daemon/status` and renders `UNKNOWN` until each answers, then
  `live-connected` / `NOT CONNECTED` and `Cron Scheduler: running` / `not running`.
- `BlueprintRoadmapModal.tsx` seeded `completionPercentage: 100` and a
  `100% Free Architecture Verified` header before `/api/blueprint` was ever
  fetched, so a network failure left a fabricated "complete" panel on screen. The
  state now starts at zero and the footer reports the measured percentage.
- New `src/utils/checksumTruth.ts` (pure, dependency-free) holds
  `fnv1a32Hex()`, `payloadChecksumLine()`, `telegramPushLabel()` and
  `cronSchedulerLabel()`.

### 🧪 Tests
- `src/tests/fabricatedStatusClaims.test.ts` (8 tests): helper determinism and
  honesty, plus source guards pinning each removed string. Negative-validated —
  restoring all four fabrications fails exactly the three component guards
  (3 failed | 5 passed); removing them passes 8/8.

---

## [Unreleased] - 2026-09-21 02:36 (21:06 UTC) — Oracle VCN ingress rules are no longer reported as verified

### 🛡️ Truthfulness
- `oracleCloudState.firewallRules` in `server.ts` declared all five VCN ingress
  rules `active: true`, and `OracleCloudModal.tsx` drew an unconditional
  checkmark per rule under a heading reading `<Lock /> Zero Accidental Ingress`.
  Nothing in the process contacts the Oracle VCN or opens an inbound socket, so
  the panel asserted an observed firewall posture for ports it never tested.
- `firewallRules[].active` is now a tri-state observation (`boolean | null`) and
  every declared rule ships `active: null` (never probed). New pure helpers in
  `src/utils/vmTelemetryDisplay.ts`: `resolveFirewallRuleState()` returns
  `OBSERVED_OPEN` / `OBSERVED_CLOSED` / `NOT_PROBED`, and
  `summarizeFirewallObservation()` returns `{ probedCount, total, verified }`.
- The modal renders `NOT_PROBED` as a label, not a tick. The "Zero Accidental
  Ingress" claim now sits behind `firewallSummary.verified` (false until every
  rule carries a real observation); otherwise the heading reads
  `Ingress NOT_PROBED (0/5 rules observed)`.
- Four further plausible defaults removed from the same modal: the hardcoded
  `CPU LOAD (4 OCPUs)` label, `of {bootVolumeGb ?? 200} GB`, a hardcoded
  `Ubuntu 24.04 LTS (Minimal ARM64)` footer (now the reported `os`, else
  `UNKNOWN`), and the "₹0 / Forever Free" Always Free checklist, now labelled
  `PROGRAMME LIMITS (NOT VERIFIED FOR THIS INSTANCE)` because billing
  entitlement is never queried.

### 🧪 Tests
- `src/tests/vmTelemetryDisplay.test.ts` covers the firewall normalisers;
  `src/tests/toolSurfaceTruthfulness.test.ts` gained two source guards (22 tests
  in the file). Negative-validated: restoring `active: true` on the five server
  rules fails exactly `the Oracle firewall rules are not asserted active without
  a probe` (1 failed | 19 passed); restoring `active: null` passes 20/20.
- Gates: `npm run lint` (`tsc --noEmit`) exit 0; `npx vitest run` 56 files /
  795 tests passed; `npm run build` exit 0 (`dist/server.cjs` 816.6 kb).

---

## [Unreleased] - 2026-09-21 02:25 (20:55 UTC) — The Oracle Cloud modal stopped inventing VM metrics

### 🛡️ Truthfulness
- `src/components/OracleCloudModal.tsx` presented unmeasured hardware numbers as
  if they came from the server. Its uptime card printed
  `{vmStatus?.uptimeHours || 342} hours continuous` — a `||`, so even a reported
  0 was rewritten to 342 — under a hardcoded `ONLINE` badge. The SSH card showed
  `Public IP: 129.154.42.108` and offered a copyable
  `ssh -i ~/.ssh/oracle_arm_key ubuntu@129.154.42.108`. The header always
  advertised `VM.Standard.A1.Flex`, 4 OCPUs, 24 GB RAM, 200 GB storage, and the
  disk card said `of 200 GB`, even with no `/api/oracle-cloud/status` response.
- New `src/utils/vmTelemetryDisplay.ts` normalises every value for display:
  `normalizeUptimeHours`, `normalizePublicIp`, `normalizeMetricPercent`
  (clamped to 0-100), `normalizeGigabytes`, `normalizeVmStatus`, and
  `buildSshCommand`. Absent values render as an explicit `UNKNOWN` or em dash,
  and the SSH card no longer offers a command for an address the server never
  reported.

### 🧪 Tests
- `src/tests/vmTelemetryDisplay.test.ts` (6 tests) covers the normalisers, and
  `src/tests/toolSurfaceTruthfulness.test.ts` gained an Oracle-modal source
  guard (18 tests in the file). Negative-validated: restoring `|| 342`,
  `|| '129.154.42.108'` and the constant `ONLINE` fails exactly 3 of the 18;
  the fix was then restored.

## [Unreleased] - 2026-09-21 02:19 (20:49 UTC) — Sample telemetry can no longer be spoken as a real reading

### 🛡️ Truthfulness
- `processOfflineCommand()` in `src/utils/localJarvisEngine.ts` decided whether
  to speak a mobile section from `available` alone. `compileMobileStatusData()`
  in `src/utils/mobileStatusEngine.ts` returns placeholder fixtures that carry
  `available: true` *and* `isSample: true`, so a device-less briefing was
  narrated as fact ("Device battery is at 91%", "You have 7 priority
  notifications"). Every section now also gates on `isSample`, and the weather
  branch reads `mobileStatus.weather` instead of the fixed 27°C / 48% /
  'New Delhi' constants.
- `MobilePersonalStatusModal.tsx` stamped "Real-Time Generated Telemetry" on the
  briefing card even when the data was sample data; the badge now reflects
  whether the snapshot was a fixture or a live read.

### 🧪 Tests
- `src/tests/localJarvisEngine.test.ts` and
  `src/tests/mobileStatusEngine.test.ts` cover the fixture-vs-measurement
  distinction. Negative-validated: reverting the `isSample` gate makes the
  engine test fail with the fixture values spoken as real.

### 📝 Notes
- The spoken briefing intentionally still states sample counts, but only inside
  a label ("2 sample notifications, including 1 priority alerts (sample data,
  not read from this device)"). An earlier assertion that the counts be omitted
  was wrong and was rewritten to assert the label instead.

---

## [Unreleased] - 2026-09-21 02:10 — Notification redaction can no longer be switched off

### 🔒 Privacy
- A prior slot made `handleIncomingNotification()`'s sensitive-content guard
  conditional on the new setting `sensitiveFilteringEnabled`. With it off, the
  raw body was kept in `pendingEvent.rawText` and pushed to every bridge
  listener via `notifyListeners()` — so an OTP, bank or credential body could be
  held in memory and broadcast, contradicting the absolute guarantee in
  `docs/MOBILE_CALL_NOTIFICATION.md`. The guard is unconditional again and the
  field is removed from `AndroidBridgeSettings` / `DEFAULT_BRIDGE_SETTINGS`
  (`src/types/mobileBridge.ts`), so a legacy persisted `false` cannot re-open it.
  `blockHealthNotificationsByDefault` (default `true`) is kept — it only widens
  what is announced.

### 🧪 Tests
- `src/tests/androidBridgePrivacySettings.test.ts` — 5 tests, covering the
  health-category block and unconditional OTP redaction. Negative-validated:
  neutralising the health gate fails the health test; re-introducing the
  settings gate fails the legacy-override test.

---

## [Unreleased] - 2026-09-21 01:40 — Host telemetry can no longer report an impossible CPU load

### 🛡️ Truthfulness
- `getHostCpuUsagePercent()` (`src/utils/hardening/hostTelemetry.ts`) probed
  `os.cpuUsage`, which is not a Node API (`undefined` on node v22.23.2), so the
  branch was dead code and every reading came from the load-average proxy. That
  proxy was unclamped, so an oversubscribed host reported a physically
  impossible utilisation — a real test run observed **107%**. Values are now
  clamped to 100%, the dead detection path is removed, and `clampCpuPercent()`
  is exported.

### 🧪 Tests
- `src/tests/hostTelemetry.test.ts` — 8 tests (was 6). The clamp is guarded
  directly; negative-validated: reverting the clamp fails with
  `expected 107 to be 100`.

---

## [Unreleased] - 2026-09-20 23:35 — Git tools stop fabricating repository state

### 🛡️ Truthfulness
- `realGitStatus`, `realGitLog` and `realGitDiff` (`server_tools.ts`) caught every
  git failure and returned `success: true` with invented data: branch `main`,
  three fabricated commit subjects, and `"Diff tool nominal."` They now return
  `success: false` with the real underlying error.
- `server.ts` `git_status_tool` renders `Git: UNKNOWN` instead of a default
  branch; `AutonomousToolsModal.tsx` renders an explicit unavailability message
  instead of passing off an empty string as "no uncommitted differences".

### 🧪 Tests
- Added `src/tests/gitToolsTruthfulness.test.ts` (6 tests). Negative-validated:
  with the `server_tools.ts` fix reverted, 4 of the 6 fail.

---

## [Unreleased] - 2026-09-20 23:05 — PermissionGuard direct test coverage

### 🧪 Automated Testing
- **`PermissionGuard` had no direct test** (`src/utils/computerOperator/permissionGuard.ts`): the Level 1-4 safety surface all computer-operator decisions flow through was only exercised indirectly via the engine. Added `src/tests/permissionGuard.test.ts` (9 tests) covering the global emergency stop, the finance exclusion guard (English and Hindi keywords), the destructive-command guard, the security-bypass guard, the Level 4 human gate (`delete`/`publish`/`broadcast`/`push --force`/`email`), safe local actions, and `isApprovalRequired`.

### 🛡️ Security & Truth Invariants
- The suite pins the invariant that a permanently blocked action (finance, security bypass) returns `requiresHumanApproval: false` and `allowed: false`, so a caller must branch on `allowed` first. Verified that `computerOperatorEngine.ts` does exactly this — such an action becomes `BLOCKED`, never `NEEDS_APPROVAL`.
- Negative-validated: neutralising the `captcha` branch of the security-bypass guard makes 1 of 9 tests fail; restoring it makes all 9 pass. No production code changed this cycle.

---

## [Unreleased] - 2026-09-20 22:35 — Caller-ID masking privacy fix

### 🛡️ Security & Truth Invariants
- **Caller-ID masking leaked subscriber digits** (`src/utils/telephonyPermissions.ts`): `maskPhoneNumber('+91 9876543210')` returned `+9198765*****`, exposing the country code plus eight of ten subscriber digits — only four were hidden. The documented privacy contract (see the `TelephonySession` type in `src/utils/androidBridgeEngine.ts`) is the `+91 ******3210` form, which that module's own helper already produced. The telephony helper now extracts the digits and keeps only the `+NN` country prefix and the last four digits. Blank input still returns `Unknown / Private`; input with ≤4 digits returns `****`.

### 🧪 Automated Testing
- Added `src/tests/telephonyPermissions.test.ts` (24 tests) covering the caller-ID masking contract (visible digits, country prefix, short/deferred numbers), telephony permission/tier resolution and clinic-safety redaction. Negative-validated: restoring the previous implementation fails 8 of 24.
- Full suite: 48 files / 715 tests passing; clean lint (`tsc --noEmit` exit 0); clean build (`dist/server.cjs`, 816,011 bytes).

---

## [Unreleased] - 2026-09-20 22:05 — Workspace path containment fix

### 🛡️ Security & Truth Invariants
- **Workspace escape via prefix-sibling directory** (`server_tools.ts`): the file routes confirmed containment with `absolute.startsWith(PROJECT_ROOT)`. A string prefix is not a directory boundary — `/…/jarvis-voice-ai-EXT` satisfies it — so `../jarvis-voice-ai-EXT/x` resolved outside the authorised workspace and passed the guard. `safeResolvePath` now normalises and requires segment-wise containment (`escapesRoot`), rejecting both traversal above the root and prefix-sibling targets.

### 🧪 Automated Testing
- Added `src/tests/workspacePathContainment.test.ts` (9 tests) covering in-root paths, `..` traversal, absolute escapes and the prefix-sibling case. Negative-validated: reverting the fix fails 4 of 9.
- Full suite: 47 files / 691 tests passing; clean lint (`tsc --noEmit` exit 0); clean build (`dist/server.cjs`, 815,943 bytes).

---

## [Unreleased] - 2026-09-20 — Notification privacy fix

### 🛡️ Security & Truth Invariants
- **Hindi OTP notifications were not classified as sensitive**: the sensitive-content matcher's Hindi OTP pattern decoded to the garbled literal `ओटगीपीप` instead of `ओटीपी`, so the body of a Hindi OTP notification could be exposed through the mobile bridge. The matcher is corrected and the `ओटपी` variant added (`src/utils/mobileNotificationPrivacy.ts`).
- Removed a dead ternary in `exposeNotificationContent` (clarity only).

### 🧪 Automated Testing
- Added `src/tests/mobileNotificationPrivacy.test.ts` (39 tests) covering sensitivity detection, app categorisation, policy resolution, identity/hashing, content exposure and ingestion. Negative-validated: reverting the matcher fails the Hindi-OTP test.
- Full suite: 45 files / 675 tests passing; clean lint; clean build.

---

## [v2.4.0] - Natural Voice Assistant + Hindi Mode Upgrade

### 🎙️ Natural Voice & Multilingual Experience
- **Calm, Professional Voice Persona**: Upgraded tone to be soft, warm, respectful, and concise without robotic fillers or repetitive "Sir/सर" suffixes.
- **Hindi & Hinglish Natural Conversational Mode**: Added native Hindi (`hi-IN`) and bilingual Hinglish conversational fluency with accurate terminology preservation.
- **Dynamic Language Detection**: Auto-detection engine intelligently routes between Hindi, Hinglish, English, and 30+ regional languages.
- **Real-Time Speech Interruption**: Added instant speech interruption via voice commands ("Stop", "रुको", "Cancel", "चुप", "बस", "शांत रहो") and HUD controls.
- **Dynamic Language Selector in Settings**: Implemented interactive dropdown in `SettingsModal` bound to `SUPPORTED_LANGUAGES` registry with live locale switching.

### 🛡️ Security & Truth Invariants
- **Level-4 Human Authorization Voice Gateway**: Voice commands for public uploads, broadcasts, and remote changes enforce explicit human confirmation.
- **Truthful Status Inquiries**: Channel status queries return verified OAuth connection states without simulated or false claims.
- **Strict Finance Exclusions Guard**: Reinforced semantic blocking of all financial and payment commands.
- **6-Tier Permission Matrix**: Enforced user control over mobile telemetry (battery, weather, notifications, calendar, email, device health).

### 🧪 Automated Testing & Documentation
- Comprehensive Vitest suite with **69/69 passing tests** across 4 test files (`languages.test.ts`, `localJarvisEngine.test.ts`, `voiceAndHindiModes.test.ts`, `legalRoutes.test.ts`).
- Created and updated documentation: `README.md`, `docs/ARCHITECTURE.md`, `docs/VOICE.md`, `docs/PRIVACY.md`, `docs/SECURITY.md`, `docs/CHANGELOG.md`, `docs/AUDIT_REPORT.md`.
