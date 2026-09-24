# 📜 CHANGELOG — HERMES JARVIS

All notable improvements, security updates, and feature additions are documented in this file.

---

## [Unreleased] - 2026-09-25 03:15 IST (2026-09-24 21:45 UTC) — work slot 11: the offline call turn stops reporting unperformed actions

### Fixed
- `generateLocalCallTurn()` (`src/utils/telephonyEngine.ts`), the fallback
  `processTelephonyTurn()` uses whenever `POST /api/telephony/handle-turn` is
  unreachable, regex-matches the caller's words and dispatches nothing — no
  calendar write, no Telegram message, no caller-ID block. Its replies still
  asserted completed work ("I have locked this into Alex's calendar and synced
  our reminders", "I have added the session to the calendar and notified the
  team", "adding your caller ID to our blocked directory"), and every captured
  follow-up read as a finished receipt ("Call completed successfully", "Calendar
  event dispatched", "Blocked spam marketing number", "Medical appointment
  confirmed for Friday 3:00 PM"). `App.tsx` surfaces both to the operator as the
  call's outcome.

### Added
- `formatLocalTurnReply()` and `formatLocalTurnFollowUp()` in
  `src/utils/hardening/callSummaryTruth.ts`. The reply is routed through the
  former, which states it is a local automated response and not a record of
  executed actions; each follow-up is routed through the latter, which marks it
  captured offline and awaiting human follow-up. The four receipt-worded
  follow-up literals were rephrased as outstanding requests.

### Tests
- 16 new assertions in `src/tests/callSummaryTruth.test.ts` (now 44 tests):
  both formatters (append, idempotent, empty-input), a 5-case table asserting
  the disclosure and the marker across the outbound wrap-up/appointment and
  inbound spam/medical/default branches, `not.toMatch` guards for the fabricated
  receipts, and two `telephonyEngine.ts` source guards. Negative-validated:
  bypassing the wrapper fails 6 of 44, restored → 44/44.

---

## [Unreleased] - 2026-09-25 02:50 IST (2026-09-24 21:20 UTC) — work slot 10: the Telegram approval reply stops reporting an approval as a verified execution

### Fixed
- `handleTelegramCallback()` (`server.ts`) handles the `approve_perm_` inline
  button sent to the operator's phone for a Level 4 action. The branch only
  records the human decision (`updateActionRequestStatus(permId, 'EXECUTED',
  ...)`) and dispatches nothing — no LinkedIn publish, no GitHub issue, no
  provider call — yet it replied `✅ *LEVEL 4 ACTION APPROVED & EXECUTED* …
  • *Status*: EXECUTED (Verified)`. Every safeguard `/api/approvals/resolve`
  applies to separate "recorded" from "confirmed" was bypassed by this path.
- `PermissionGateway.tsx` rendered the same `EXECUTED` status as "Action was
  authorized and executed successfully." with no provider result behind it.

### Added
- `formatUnconfirmedMobileApprovalReply()` in
  `src/utils/hardening/approvalResolution.ts` — the only builder of that reply
  now. It describes the recorded status and states plainly that the external
  action was **not dispatched by this path** and is `UNVERIFIED`. A
  non-`EXECUTED` status (e.g. `FAILED`) is reported as-is.
- The `EXECUTED` panel in `PermissionGateway.tsx` reads "Authorization
  recorded. Provider confirmation is required before this action can be
  reported as executed." and shows `UNVERIFIED — no provider result` when no
  `resultUrn` exists.
- 6 assertions in `src/tests/approvalResolutionTruth.test.ts` (now 14 tests):
  the reply never matches `/APPROVED & EXECUTED/` or `/\(Verified\)/`, still
  names the action and target, does not claim `APPROVAL RECORDED` for a
  non-`EXECUTED` status, falls back to the request id, plus two `server.ts`
  source guards.

### Verification
- Negative-validated: restoring the old reply string fails exactly the two
  `server.ts` guard tests (`2 failed | 12 passed`); restored → 14/14.
- Gates observed: `npm run lint` (`tsc --noEmit`) exit 0; targeted 1 file /
  14 tests passed; full suite **96 files / 1256 tests passed**; `npm run build`
  exit 0, `dist/server.cjs` 869141 bytes.
- E2E: NOT RUN — no Telegram bot credentials, no handset. Deploy:
  NOT_CONFIGURED. Item 13 stays `PARTIAL`.

---

## [Unreleased] - 2026-09-25 00:45 IST (2026-09-24 19:15 UTC) — work slot 8: the server telephony turn path stops returning follow-ups as done work

### Fixed
- `POST /api/telephony/handle-turn` (`server.ts`) returned follow-ups phrased
  as completed work: the Gemini branch passed the model's
  `parsed.followUpActions` through verbatim, and the rule-based fallback
  returned `Calendar updated: Thursday 2:30 PM`, `Send confirmation SMS`,
  `Notify resident of package delivery at foyer` and `Add number to local
  blocklist`. Neither branch dispatches a calendar write, an SMS, a blocklist
  change or a package follow-up — the route produces reply text only, and the
  UI renders the returned list as the call's action items. Slot 6 fixed the
  client summariser and missed this server path.

### Added
- `formatLiveActionItem()` in `src/utils/hardening/callSummaryTruth.ts` —
  appends `recorded live — not confirmed as performed` to a captured follow-up
  (idempotent, distinct from the retrospective summary marker). Both
  `handle-turn` branches map their follow-ups through it.
- 8 assertions in `src/tests/callSummaryTruth.test.ts` (now 21 tests): the
  formatter truth table, idempotence, the distinct-marker check, and four
  server source guards. Negative-validated — reverting both `map()` calls
  fails exactly the two matching guards (`2 failed | 19 passed`), restored →
  21/21.

---

## [Unreleased] - 2026-09-24 23:50 IST (2026-09-24 18:20 UTC) — work slot 6: the call summary stops reporting follow-ups as done work and stops asserting an unobserved positive call

### Fixed
- `summarizeCallTranscript()` (`src/utils/telephonyEngine.ts`) pushed action
  items phrased as completed receipts (`Added caller to spam blocklist`,
  `Calendar appointment updated`, `Calendar event dispatched`) and a summary
  line (`Successfully conveyed objectives ... synced action items`) while only
  regex-matching transcript text. Nothing in that path dispatches a calendar
  event, blacklists a number, or sends an SMS. Its `sentiment` also defaulted
  to `'positive'`, so a transcript matching no keyword rendered a green
  `POSITIVE` badge although the function performs no sentiment analysis.

### Added
- `src/utils/hardening/callSummaryTruth.ts` — `formatActionItem()` marks a
  recorded follow-up as outstanding (`... — not performed — recorded for human
  follow-up`), `describeOutboundCall()` / `describeInboundCall()` state only
  that a call took place, and `ACTION_ITEM_LIST_NOTE` sits under the heading.
- Two sentiment regression tests pinning the unobserved default to `'neutral'`.

### Changed
- Item strings rephrased from past-tense receipts to imperatives; the
  sentiment default is now `'neutral'`; `CheckCircle2` replaced with a neutral
  dot in the action list.

### Tests
- `src/tests/callSummaryTruth.test.ts` — 13 tests. Negative-validated twice:
  restoring the receipt literals fails the matching source guard, and reverting
  the sentiment default fails exactly the two new tests (`2 failed | 11
  passed`); both restored → 13/13. Full suite 96 files / 1234 tests passed;
  build exit 0 (`dist/server.cjs` 846.8 kB).

---

## [Unreleased] - 2026-09-24 23:19 IST (2026-09-24 17:49 UTC) — work slot 5: the geocode panel stops vouching for an offline quadrant guess

### Fixed
- `reverseGeocodeCoordinates()` (`src/utils/locationService.ts`) fell back to
  `estimateOfflineRegion()` on a failed or non-OK Nominatim request, and that
  fallback returned confident civic names (`'Indian Subcontinent Core'`,
  `'Telemetry Sector'`) with country values. `LocationServicesModal.tsx`
  stamped the result `CIVIC SECTOR / REVERSE GEOCODE` and rendered
  `City: <name>`/`Country: <name>`; `DashboardMapSnippet.tsx` showed the same
  as a `CIVIC SECTOR` pill. The UI presented a guess as a resolved address.

### Added
- `LocationAddress` (`src/types/location.ts`) carries optional
  `resolved` / `source` provenance fields. The offline fallback sets
  `resolved: false` / `source: 'offline_estimate'` and an address string that
  says `offline estimate, not a resolved address`; a real lookup sets
  `resolved: true` / `source: 'nominatim'`.
- `isResolvedAddress()` exported from `locationService.ts`.

### Changed
- `LocationServicesModal.tsx` and `DashboardMapSnippet.tsx` gate their
  `CIVIC SECTOR` / `REVERSE GEOCODE` labels on `isResolvedAddress()`, rendering
  `REGION ESTIMATE / NO GEOCODER` and an amber offline-estimate note instead.
  The modal's map pin falls back to `GPS Lock Point` rather than a guessed city.

### Tests
- `src/tests/geocodeEstimateTruth.test.ts` — 7 tests covering the three
  `reverseGeocodeCoordinates` paths, the `isResolvedAddress` truth table, and
  source guards on the fallback and both components. Negative-validated:
  flipping the fallback flag fails 3.

---

## [Unreleased] - 2026-09-24 22:47 IST (2026-09-24 17:17 UTC) — work slot 4: the call HUD stops claiming an acoustic bandpass it never applies

### Fixed
- `telephonyAudio.enableTelephoneBandpass()` creates a `BiquadFilterNode` that
  is never connected into any audio graph — the synthesizer writes tones
  directly to `ctx.destination` and has no call-audio input to filter. The HUD
  still labelled the toggle `3G Filter` / `HD Voice`, titled it
  `Telephone Acoustic Bandpass Filter (300-3400Hz)`, and the telephony hub
  rendered `300-3400Hz ON`, presenting a simulated effect as an applied one.
- Both surfaces now render the honest status
  (`src/utils/hardening/acousticFilterTruth.ts`,
  `ACOUSTIC_FILTER_STATUS = 'BANDPASS_NOT_APPLIED'`), and the
  `acousticFilterEnabled` field comment in `src/types/telephony.ts` no longer
  describes it as a call-audio simulation.

### Tests
- `src/tests/hardening/acousticFilterTruth.test.ts` (6 tests): status-string
  unit cases plus source guards on `ActiveCallHUD.tsx` and
  `TelephonyHubModal.tsx`. Negative-validated: restoring the `3G Filter` /
  `HD Voice` literals fails exactly the matching case (`1 failed | 5 passed`);
  restored → 6/6.

## [Unreleased] - 2026-09-24 22:11 IST (2026-09-24 16:41 UTC) — work slot 3: the spam screen stops vouching for callers

### Fixed
- `evaluateSpamRisk()` in `src/utils/telephonyEngine.ts` returned
  `'Verified Legitimate Caller'` as its `reason` whenever none of its nine spam
  keywords matched. The matcher compares first-line text only — it consults no
  carrier reputation source, no STIR/SHAKEN attestation and no contacts — so a
  caller it could not assess was reported to the operator as vetted.
- The fallback routes through `spamReasonLabel()`
  (`src/utils/hardening/spamVerdictTruth.ts`), which yields
  `NO_SPAM_MATCH_REASON` — "No spam indicator matched — caller not vetted" —
  and preserves a real match reason verbatim.

### Tests
- `src/tests/spamVerdictTruth.test.ts` (7 tests): neutral-reason unit cases, a
  guard that the constant contains neither "verified" nor "legitimate", the
  `evaluateSpamRisk` no-match and match branches, and two source guards.
  Negative-validated against the pre-fix literal: `2 failed | 5 passed`;
  restored → 7/7.

---

## [Unreleased] - 2026-09-24 21:36 IST (2026-09-24 16:06 UTC) — work slot 2: regression coverage for modern OpenAI key prefixes

### Tests
- `src/tests/credentialRedactor.test.ts`: three cases for the `sk-proj-`,
  `sk-svcacct-` and `sk-admin-` key shapes that slot 1's regex fix introduced
  but never asserted. The `sk-proj-` case uses an unlabelled key on purpose — a
  `KEY=` label is caught by the generic labelled-secret rule and would make the
  test pass even against the broken quantifier (observed on the first draft).
  Negative-validated against the pre-fix regex: all three fail
  (`3 failed | 21 passed`); current pattern → 24/24.

---

## [Unreleased] - 2026-09-24 21:06 IST (2026-09-24 15:36 UTC) — work slot 1: process uptime is no longer labelled as VM uptime

### Fixed
- The Telegram reply headed `ORACLE CLOUD ARM VM STATUS` rendered
  `Uptime: Nh` from `oracleCloudState.uptimeHours`, which is
  `Date.now() - DAEMON_BOOT_TIME` — the lifetime of this Node process, not the
  instance's cloud uptime. `OracleCloudModal.tsx` showed the same number on its
  instance card as `Nh hours continuous`. Both now go through
  `processUptimeLabel()`, which names the figure as the process uptime and
  reports a non-finite or negative value as unmeasured; the reply and card say
  the instance uptime is not probed here.
- `src/utils/hardening/processUptimeTruth.ts`: new pure
  `processUptimeLabel(hours)`.
- `src/types.ts`: `OracleVMStatus.uptimeHours` documented at its declaration as
  the process lifetime, not the cloud uptime.

### Tests
- `src/tests/hardening/processUptimeTruth.test.ts`: 10 tests — the helper's
  rendering and its `not measured` fallbacks, plus source guards against the
  removed `Uptime: ${...uptimeHours}h` literal and the `hours continuous` claim.
  Negative-validated: restoring the pre-fix reply text fails 3 of 10.

---

## [Unreleased] - 2026-09-24 04:05 IST (2026-09-23 22:35 UTC) — work slot 15: blueprint cost table derived from declared-plan helpers

### Fixed
- `/api/blueprint/report` section 4 printed a fixed `₹0.00` on all seven
  component rows and `₹0.00 / Forever Free` as the total, under a "Strict
  Zero-Cost Blueprint" heading. Nothing in the process queries a billing or
  entitlement API, so the table asserted an unobserved guarantee — and it
  contradicted the report header, which slot 13 had already corrected to
  `describeBillingCost`. The table now derives every figure from the truth
  helpers; the heading is "Declared Zero-Cost Blueprint" with an explicit
  statement that the figures are the declared plan, not an observation.
- `src/utils/hardening/billingEntitlementTruth.ts`: new pure
  `declaredCostCell(declaredLabel)` returning
  `<label> — declared plan, no billing API queried`.

### Tests
- `src/tests/hardening/billingEntitlementTruth.test.ts`: four new assertions —
  no `₹0.00 / Forever Free` or `Strict Zero-Cost Blueprint` in the source;
  exactly seven `declaredCostCell('₹0')` calls; the total uses
  `describeDeclaredCost('₹0', oracleCloudState.billingEntitlement)`; and
  `declaredCostCell` never emits a bare `₹0`. Negative validated (restore the
  pre-fix `server.ts` → 2 of 20 fail).

---

## [Unreleased] - 2026-09-24 03:35 IST (2026-09-23 22:05 UTC) — work slot 14: Telegram lead listing rendered from stored records

### Fixed
- The Telegram `cmd_view_leads` ("View Freelance Leads") branch interpolated
  only the lead count into two hardcoded rows — `Aarav Tech Solutions — ₹65,000
  (Quotation Sent)` and `Global Horizon Exports — ₹85,000 (AI Requirements
  Extracted)`. A renamed, deleted or newly added lead still produced the same
  two lines, so the message asserted records that need not exist and hid the
  records that did. The branch now renders `freelanceLeadsReply(memoryState.freelanceLeads)`.
- `src/utils/freelanceLeadTruth.ts`: new pure `freelanceLeadsReply(leads)`.
  Lists each stored lead with its own name, amount, currency and status; states
  an empty pipeline plainly (`ACTIVE FREELANCE LEADS (0)` + "No freelance lead
  is stored in the pipeline") instead of inventing a first row; and escapes
  Telegram markdown in client-supplied names.

### Tests
- `src/tests/freelanceLeadTruth.test.ts`: renders stored leads; does not emit
  the sample names for a different store; plain empty-pipeline message; markdown
  escaping; and a source guard asserting the `cmd_view_leads` branch calls the
  helper and no longer contains the `Aarav Tech Solutions` / `₹65,000` literal.
  Negative validated (revert the helper call → 1 of 5 fails).

---

## [Unreleased] - 2026-09-24 03:05 IST (2026-09-23 21:35 UTC) — work slot 13: decorative cost / entitlement badges

### Fixed
- `HUDHeader.tsx` rendered the literal chip `₹0 Always Free` and
  `OracleCloudModal.tsx` rendered `₹0.00 / Forever Free`, both unconditional
  markup, while nothing in the repo queries the OCI billing / entitlement API.
  The badges now render `billingBadgeLabel(entitlement)`: the unqueried state
  reads `Always Free (declared plan — entitlement not probed)`, and a `₹0`
  figure appears only after an explicit `FREE` observation. `BILLED` is labelled
  as such.
- `src/utils/hardening/billingEntitlementTruth.ts`: new `billingBadgeLabel` and
  `parseBillingEntitlement`. The parser folds any value that is not exactly
  `FREE`/`BILLED` (lowercase, boolean, missing field) to `null`, so a malformed
  payload can never be upgraded into a claim.
- `src/types.ts`: nullable `billingEntitlement` / `billingObservedAt` on
  `OracleVMStatus`. `src/utils/hudTelemetry.ts` now carries the entitlement from
  the same `/api/oracle-cloud` payload instead of rendering a constant.

### Tests
- `src/tests/hardening/billingEntitlementTruth.test.ts`: unobserved badge wording
  (never `₹0`), `undefined` stays labelled, observation-only confirmed figure,
  parser rejection of non-observation values, and source guards pinning the
  fixed literals out of both components. Negative validated (restore the
  `₹0 Always Free` literal → 1 of 17 fails).
- `src/tests/hudTelemetry.test.ts`: entitlement pass-through plus null on a
  missing / malformed field.

## [Unreleased] - 2026-09-24 02:35 IST (2026-09-23 21:05 UTC) — work slot 12: proactive routines' server-status verdict

### Fixed
- Each of the four routines built by `buildProactiveReports()` in `server.ts`
  published `systemHealth.serverStatus = 'Nominal'` as a literal. Nothing
  measured it, so a wedged or degraded server reported the same confident
  verdict. New `src/utils/hardening/serverHealthTruth.ts` returns `NOT_MEASURED`
  by default and reserves `Nominal`/`Warning`/`Critical` for a status derived
  from an external observation. Each routine now carries the matching note in
  `keyInsights`. `src/types.ts` widens `serverStatus` with `NOT_MEASURED`.

### Tests
- `src/tests/hardening/serverHealthTruth.test.ts` (7 tests): unmeasured default,
  unknown-value handling, claim wording, and source guards pinning the literal
  out of `server.ts` with the derived wiring present four times. Negative
  validated (restore one literal → 2 of 7 fail).

## [Unreleased] - 2026-09-24 02:05 IST (2026-09-23 20:35 UTC) — work slot 11: Telegram seeded transcript & Oracle hosting claim

### Fixed
- `telegramMessages` was seeded with three messages before anything was
  received — a bot greeting, a user command, and a bot `PROJECT AUDIT REPORT`
  naming two repositories, "Branch main: clean, 0 open issues" and "Oracle VM
  deployment sync complete". `/api/telegram/messages` returns that array, so
  the gateway and web panel showed a fabricated audit as recorded history. The
  seed is now one explicitly-labelled startup notice stating no message was
  exchanged and no work was performed.
- The `/start` reply and three plain-language fallbacks told the operator
  "Connected to your Oracle Always Free ARM VM (24/7 Daemon Active)". This
  process never queries an OCI control plane and never measures daemon uptime.
  New `src/utils/hardening/telegramHostClaim.ts` (`telegramHostClaim`,
  `telegramGatewayWelcome`, `telegramSeedMessages`) derives the hosting
  sentence from the measured host identity and qualifies an Oracle instance as
  a hostname match only.
- Backlog item #13 (`Zero-fake-success for all tools`) remains `PARTIAL`.

### Tests
- New `src/tests/hardening/telegramHostClaim.test.ts` (8 tests): both host
  claims, the single-notice seed, and source guards pinning the removed
  literals and the derived wiring. Negative-validated — restoring both
  fabrications fails exactly the four matching guards (`4 failed | 4 passed`),
  restored → 8/8.

---

## [Unreleased] - 2026-09-24 01:35 IST (2026-09-23 20:05 UTC) — work slot 10: Oracle Always Free cost claim

### Fixed
- The Telegram `cloud_telemetry` reply printed a fixed
  `• *Cost*: ₹0 / Always Free Guaranteed` directly beneath live CPU/RAM
  readings, and `/api/blueprint/report` printed
  `₹0.00 / Always Free (Strict Zero-Cost Guarantee)` — for every process.
  Nothing in this server calls the OCI billing/entitlement API, and the Oracle
  Cloud modal already labels that same fact `NOT_PROBED`, so a "Guaranteed"
  price sitting next to live telemetry read as an observation. New
  `src/utils/hardening/billingEntitlementTruth.ts` (`describeBillingCost`,
  `describeDeclaredCost`) reports a figure only for an observed `FREE`/`BILLED`
  entitlement and otherwise names the missing probe;
  `oracleCloudState.billingEntitlement` is seeded `null` (never `'FREE'`). The
  Telegram reply, the report header and the Phase 1 blueprint row now state the
  declared plan and the absent observation.
- Backlog item #13 (`Zero-fake-success for all tools`) remains `PARTIAL`.

### Tests
- New `src/tests/hardening/billingEntitlementTruth.test.ts` (9 tests): the
  tri-state helper plus source guards pinning the removed literals and the
  derived `describeBillingCost` call. Negative-validated — restoring the
  hardcoded reply fails exactly the matching guard (`1 failed | 8 passed`),
  restored → 9/9.

---

## [Unreleased] - 2026-09-24 00:49 IST (2026-09-23 19:19 UTC) — work slot 8: voice visualiser & call level bars

### Fixed
- `App.tsx` seeded `volumeLevel` from `Math.floor(20 + Math.random() * 60)` on a
  100 ms interval when speech recognition started, so `JarvisOrb`'s ring scaled
  and pulsed as though it followed a microphone amplitude — no audio analyser is
  wired into that path. The voice path now uses
  `src/utils/hardening/micInputTruth.ts`, which returns a level only for a finite
  measurement in `0..100` and `0` otherwise.
- `ActiveCallHUD.tsx` sized each of its six `Audio Waveform Bars` from
  `Math.floor(Math.random() * 16 + 4)` on every render, so the strip danced as
  though it followed live call audio. `src/utils/hardening/callWaveform.ts` now
  supplies a fixed decorative bar profile with a clamped index lookup.
- Backlog item #13 (`Zero-fake-success for all tools`) remains `PARTIAL`.

### Tests
- New `src/tests/hardening/micInputTruth.test.ts` (4 tests) and
  `src/tests/hardening/callWaveform.test.ts` (4 tests), each with a source guard
  that the fabricated expression is gone and the honest call is present.
  Negative-validated: restoring each fabricated expression fails exactly 1 of 4,
  restored → 4/4.

### Verification
- lint (`tsc --noEmit`) exit 0; targeted 2 files / 8 tests passed; full vitest
  **85 files / 1136 tests passed**; build exit 0 (`dist/server.cjs` 843.2 kB).
  `npm audit` NOT RUN (no audit script). E2E NOT RUN (no device/display here).

---

## [Unreleased] - 2026-09-23 23:46 IST (2026-09-23 18:16 UTC) — work slot 6: daemon AI-engine status truth

### Fixed
- `/api/daemon/status` returned `aiEngine.model = 'gemini-2.5-flash'` and
  `provider = 'Google Gemini 2.5 Flash'` unconditionally, next to
  `fallbackActive: !process.env.GEMINI_API_KEY`. Without an API key the process
  answers with the offline bilingual heuristic engine, yet the status body still
  named a Gemini model that never ran. `aiEngineProviderLabel` /
  `aiEngineModelName` in the new `src/utils/hardening/aiEngineTruth.ts` derive
  both values from the key's presence and report **no model** (`null`) when the
  offline engine is in use; `src/types.ts` widens `aiEngine.model` to
  `string | null`.
- Backlog item #13 (`Zero-fake-success for all tools`) remains `PARTIAL`.

### Tests
- New `src/tests/aiEngineStatusTruth.test.ts` (4 tests): helper truth table plus
  source guards pinning the absence of the constant-model literal and the route's
  use of the helpers. Negative-validated: reverting the fix fails 2 of 4.

---

## [Unreleased] - 2026-09-23 23:16 IST (2026-09-23 17:46 UTC) — work slot 5: finance guard false positives

### Fixed
- `isFinanceBlocked()` in `server_tools.ts` matched each keyword with a
  word-boundary regex **and** a bare `lower.includes(kw)` fallback. Short finance
  tokens (`eth`, `btc`, `upi`, `cvv`) occur inside ordinary English words, so
  benign operator text ("tell me **wheth**er the build passed", "run the tests
  **togeth**er", "use a different **meth**od") was returned as a blocked
  financial operation. The substring fallback is removed; word-boundary matching
  is the only rule, and every real financial phrasing still blocks.
- Backlog item #13 (`Zero-fake-success for all tools`) remains `PARTIAL`.

### Tests
- New `src/tests/financeGuardFalsePositives.test.ts` (8 tests): seven benign
  phrases containing short tokens must not block, and six real financial
  phrasings must still block. Negative-validated — restoring
  `|| lower.includes(kw)` fails exactly 3 of 8 (`3 failed | 5 passed`),
  restored → 8/8. Gates on `7d9ea03`: lint exit 0, vitest **82 files / 1116
  tests passed**, build exit 0 (`dist/server.cjs` 862985 bytes / 842.8 kB).

---

## [Unreleased] - 2026-09-23 22:40 IST (2026-09-23 17:10 UTC) — work slot 4: HUD GPS provenance

### Fixed
- `HUDHeader.tsx` rendered a hardcoded green `GPS: GEO-SERVICES` pill in every
  state — no fix, cached position, simulated tactical preset, or manual entry —
  asserting a device GPS link the HUD never checked, even though every other
  location surface already tracked provenance via `CoordsSource`. Added
  `locationFixBadge()` to `src/utils/locationService.ts` (only `live` is marked
  live; `null` → `NO FIX`), the pill now derives from it and is grey for
  anything but a live fix, and `App.tsx` forwards `locationSource={userCoordsSource}`.
- Backlog item #13 (`Zero-fake-success for all tools`) remains `PARTIAL`.

### Tests
- `src/tests/locationServicesTruth.test.ts` extended to 16 tests: the pill never
  contains the hardcoded claim, derives from `locationFixBadge`, and only a live
  source is marked live. Negative-validated — restoring the hardcoded label
  fails 1 of 16, restored → 16/16. Gates on `144a995`: lint exit 0, vitest **81
  files / 1108 tests passed**, build exit 0 (`dist/server.cjs` 842.8 kB).

---

## [Unreleased] - 2026-09-23 22:16 IST (2026-09-23 16:46 UTC) — work slot 3: computer-operator completion summaries

### Fixed
- `computerOperatorEngine.ts` reported every successful Screen-Research run as
  `All N step(s) executed and visually verified. System state nominal.`, even
  when `ScreenObserver` served the built-in illustrative view whose pre/post
  frames are both synthetic — so the step "verifications" compared fabricated
  frames and still claimed a real screen was seen. The claim is now gated on
  `ScreenObserver.isHostBacked()`: host-backed runs read `verified against the
  host desktop`, illustrative runs are prefixed `SIMULATION_ONLY` and state the
  run was not visually verified.
- `resumeApprovedTask` awaited nothing from `executor.executeAction(...)` and
  stamped `COMPLETED` / `Authorized action completed and verified` for any
  approved action, including one the executor rejected. It now reads the result
  and ends `FAILED` (with a `BLOCKED` event carrying the real error) when the
  action did not succeed.
- Backlog item #13 (`Zero-fake-success for all tools`) remains `PARTIAL`.

### Tests
- `src/tests/computerOperatorTaskStatus.test.ts` (6 tests): SIMULATION_ONLY
  labelling, host-backed verification claim, failed approved action ending
  `FAILED`, non-approved resume refused. Negative-validated — reverting the
  resume guard fails 2 of 6. Gates on `2afb84b`: lint exit 0, vitest **81 files
  / 1104 tests passed**, build exit 0 (`dist/server.cjs` 863007 bytes).

## [Unreleased] - 2026-09-23 21:53 IST (2026-09-23 16:23 UTC) — work slot 2: computer-operator interpretation card

### Fixed
- `ComputerOperatorModal.tsx`'s `SEMANTIC SCREEN INTERPRETATION` card rendered
  `ScreenInterpreter.interpret(...).summary` unconditionally. `ScreenInterpreter`
  always emits a confident `Screen showing "<app>" ...` summary, so an
  illustrative preview or an unreachable host still narrated a live screen.
  Added `observationInterpretationNotice()` in
  `src/utils/computerOperator/observationTruth.ts` (on `screenSyncState`) and the
  modal now renders it ahead of the summary.
- Backlog item #13 (`Zero-fake-success for all tools`) remains `PARTIAL`.
- Guarded by 5 new assertions in `src/tests/observationTruth.test.ts`;
  negative-validated. Gates on `3d3a7f7`: lint exit 0, vitest **80 files / 1098
  tests passed**, build exit 0.

## [Unreleased] - 2026-09-23 04:36 IST (2026-09-22 23:07 UTC) — finalization: window verified, no new development

### Verification only (no code change)
- Window finalization slot. Frozen tip `89e60cb` re-verified end to end; no new
  development was started.
- `npm run lint` (`tsc --noEmit`) exit 0; `npx vitest run`
  **80 files / 1093 tests passed** (21.50 s); `npm run build` exit 0,
  `dist/server.cjs` 860748 bytes.
- Security: `.env` git-ignored and untracked, working tree clean, no real
  credential in `git diff origin/main` (matches are synthetic test fixtures).
- E2E: NOT RUN — no real-device harness and no physical Android handset.
- Deploy: NOT_CONFIGURED — no deployment target present in this environment.
- PR #4 open, non-draft, `mergeable_state: clean`; `main` NOT merged (human gate).

---

## [Unreleased] - 2026-09-23 04:18 IST (2026-09-22 22:48 UTC) — the live weather path invented a reading

### Truthfulness fix
- `server.ts` — `case 'weather_inquiry'` in `POST /api/chat` and
  `GET /api/mobile/telemetry` returned a constant 27°C / 48% / 'New Delhi'
  snapshot as current conditions. The offline intent engine was fixed in
  `4a98514`, but the live HTTP path was missed and no weather provider is wired
  into this process. Both now report the absence: `actionExecuted: false` with an
  explicit EN + HI "no weather source connected" message, and
  `weatherSnapshot: { available: false, reason: … }`.

### Tests
- `src/tests/liveWeatherHonesty.test.ts` (new, 4 tests) — source guards pinning
  the absence of the fabricated weather literal on both routes.

---

## [Unreleased] - 2026-09-23 03:42 IST (2026-09-22 22:12 UTC) — the blueprint bar rendered an unmeasured 0%

### Truthfulness fix
- `src/utils/blueprintTruth.ts` (new) — `blueprintProgress()` returns
  `UNMEASURED`/`MEASURED` and a `null` — never a coerced `0` — for an unread flag
  or an out-of-range/non-numeric value, plus `blueprintPercentageLabel()`,
  `blueprintProgressLabel()`, `blueprintFooterLabel()` and
  `blueprintPhaseCountLabel()`, which render `UNKNOWN` for an unmeasured figure.
- `src/components/BlueprintRoadmapModal.tsx` — the modal seeds
  `completionPercentage: 0` and previously kept it whenever `/api/blueprint`
  failed (no `res.ok` check), so its "Readiness Progress" bar, percentage readout
  and footer rendered a measured "0% complete" that nothing measured; the header
  also printed a hardcoded `TOTAL PHASES: 10 (Phase 0 to 9)`. It now tracks a
  `blueprintRead` flag set only after a `res.ok` response carrying `phases` and
  renders every figure through the helpers.

### Tests
- `src/tests/blueprintProgressTruth.test.ts` (new, 9 tests).

---

## [Unreleased] - 2026-09-23 03:13 IST (2026-09-22 21:43 UTC) — the call UI leaked the number it masked

### Privacy / honesty fix
- `src/utils/telephonyPrivacyDisplay.ts` (new) — `shouldMaskParty()` and
  `resolveDisplayNumber()`. Both the "is this party masked" badge and the printed
  number now derive from one predicate (masking enabled && caller is not a saved
  contact), so the badge and the number can no longer disagree.
- `src/components/ActiveCallHUD.tsx` — the live call HUD rendered a `MASKED`
  badge for `isMaskActive && isUnknownInbound` while printing
  `{activeCall.callerNumber}` — the raw carrier number — directly beneath it. The
  number now goes through `resolveDisplayNumber`, and the badge is keyed to
  `counterpartIsMasked` (the party actually shown), so a saved contact shows the
  real number with no badge and an unknown caller shows the masked number with
  one.
- `src/components/TelephonyHubModal.tsx` — the call-history panel printed
  `selectedLog.callerNumber` raw under a `PRIVACY MASKED` label; it now renders
  the resolved number.

### Tests
- `src/tests/telephonyPrivacyDisplay.test.ts` (7 tests) — the masked form equals
  `maskPhoneNumber(...)` and never contains the raw trailing digits; a saved
  contact is never masked; source guards assert neither component interpolates
  the raw field. Negative-validated: both guarded patterns are present at HEAD
  and absent after the fix.

Gates on `8b6787b`: lint (`tsc --noEmit`) exit 0, vitest **77 files / 1074 tests
passed**, build exit 0 (`dist/server.cjs` 860517 bytes).

---

## [Unreleased] - 2026-09-23 02:42 IST (2026-09-22 21:12 UTC) — the YouTube Studio header printed scopes it never read

### Honesty fix
- `src/components/SocialMediaModal.tsx` — the YouTube Studio header
  short-circuited on `status === 'API_VERIFIED'` and then printed the literal
  `Scopes: youtube.upload, youtube.readonly`. Slot 11 had already made the
  server report the true grant and set `canPublish: false` for a read-only
  channel, so a `channels.list`-confirmed channel with no upload scope displayed
  upload authorization anyway. The header now renders the scopes the server
  actually returned and states "Video upload is NOT authorized" unless the
  server confirmed `canPublish`.
- `src/utils/socialPublishHonesty.ts` — new `describeGrantedScopes()` (renders
  an unrecorded grant as `not recorded`, an empty one as `none granted`, never
  the requested list) and `youtubeCanPublishMeasured()` (publish is authorized
  only for an `API_VERIFIED` connection the server also marked `canPublish`).

### Tests
- `src/tests/socialPublishHonesty.test.ts` — 6 new tests (24 total) pinning
  read-access ≠ upload-access, including the exact slot-11 case
  (`API_VERIFIED` + `canPublish:false`). Negative-validated: removing the
  `canPublish` check fails exactly 2 of 24, restored → 24/24.

---

## [Unreleased] - 2026-09-23 02:17 IST (2026-09-22 20:47 UTC) — social connections claimed scopes they never had

### Honesty fix
- `src/utils/socialPublishHonesty.ts` — new `PLATFORM_PUBLISH_SCOPES` (the
  upload/publish scope each platform id needs), `grantedScopesFromTokenResponse`
  (reads the real `scope` field; `null` when the provider was silent),
  `scopeGranted`, and `publishScopeGranted` (tri-state — an unrecorded grant is
  UNKNOWN, never granted).
- `server.ts` — `getPlatformIntegrationsStatus`, `/api/auth/linkedin/status` and
  `/api/auth/youtube/status` reported `conn?.scopes || ['w_member_social',
  'openid', 'profile', 'email']` (and the YouTube equivalent) when nothing had
  been recorded, and the LinkedIn callback stored that same invented list when
  the token response carried no `scope`. All four sites now report only the
  observed grant, `[]` when unrecorded.
- `server.ts` — `/api/auth/youtube/status` `canPublish` follows the recorded
  upload scope instead of being unconditionally `true`; `channels.list` proves
  read access only. A `message` explains a missing upload scope.
- `server.ts` — `verifyAndPublishToYouTube` refuses pre-flight with
  `NOT_PUBLISHED` / `MISSING_CREDENTIALS` / `DRAFT` when the stored grant lacks
  `youtube.upload`, rather than discovering it as a provider 403.
- `server.ts` — publish confirmations no longer read `Live on …`. A provider id
  proves creation, not reach: LinkedIn/Facebook/Instagram/X now say
  `VERIFIED UPLOAD` with the returned id, and YouTube states the privacy
  actually applied — only a `public` upload reads `VERIFIED & PUBLIC`, while
  `private`/`unlisted` state who can see it.

### Tests
- `src/tests/socialPublishHonesty.test.ts` — 18 tests (5 new) covering the scope
  map, silent-provider handling, and the tri-state grant check.
  Negative-validated: weakening `publishScopeGranted` so an unrecorded list
  reads as granted fails exactly 1 of 18 (`1 failed | 17 passed`); restored →
  18/18.

### Gates
- lint (`tsc --noEmit`) exit 0; vitest **76 files / 1061 tests passed**; build
  exit 0 (`dist/server.cjs` 840.3 kb). Commit `ef2dba7`.

---

## [Unreleased] - 2026-09-23 01:39 IST (2026-09-22 20:09 UTC) — the Telegram security posture was hardcoded

### Honesty fix
- `server.ts` — the Telegram `security_audit` reply and the `/start` welcome
  printed fixed text (`Human Approval: Enforced for all external actions`,
  `Passwords & API tokens strictly isolated`, `Level 4 actions strictly require
  your mobile confirmation`) without reading the Security Matrix. Both flags are
  operator-flippable via `POST /api/security/matrix`, so a gate turned off was
  still reported as enforced.
- `src/utils/hardening/securityMatrixTruth.ts` — new `securityMatrixPosture()`
  and `triState()` derive the posture from the observed
  `humanApprovalForExternal` / `maskSensitiveData` / `credentialLeakProtection`
  flags and hold `UNKNOWN — not observed` for any value never read.

### Tests
- `src/tests/hardening/securityMatrixTruth.test.ts` — 9 new tests: the
  tri-state, the posture for false/true/missing flags, and source guards pinning
  the removal of both literals and the derived call form. Negative-validated:
  restoring `Enforced for all external actions` fails exactly 2 of 9
  (`2 failed | 7 passed`); `9 passed` with the fix.

### Verification
- lint (`tsc --noEmit`) exit 0; `npx vitest run` **76 files / 1056 tests
  passed**; `npm run build` exit 0 (`dist/server.cjs` 837.7 kb).

---

## [Unreleased] - 2026-09-23 01:06 IST (2026-09-22 19:36 UTC) — the unknown-caller announcement was dead code

### Privacy fix
- `src/utils/androidBridgeEngine.ts` — `handleIncomingCall` selected the
  localized unknown-caller fallback with `masked !== 'Unknown'`, a sentinel
  `maskPhoneNumber` no longer returns after slot 8's repair. The `अज्ञात नंबर`
  branch was therefore unreachable and the announcement spliced the literal
  `Unknown Number` into the Hindi sentence. The branch now selects on
  `/\d/.test(masked)` and gives Hinglish/English their own honest fallback.
- `src/utils/androidBridgeEngine.ts` — both `maskPhoneNumber` call sites no
  longer pass the `|| 'Unknown'` sentinel; the helper classifies a digit-free
  input itself.

### Tests
- `src/tests/androidMobileBridge.test.ts` — Scenario 21 guards that a bridge
  call with no caller number fabricates no digits and does not splice
  `Unknown Number` into the announcement (file now 40 tests, up from 39).
  Negative-validated against the upstream-only engine: `1 failed | 39 passed`
  of 40; `40 passed` with the repair.

### Verification
- lint (`tsc --noEmit`) exit 0; `npx vitest run` **75 files / 1047 tests
  passed** (19.49 s, re-run in slot 9).

---

## [Unreleased] - 2026-09-23 00:25 IST (2026-09-22 18:55 UTC) — the finance-guard badge asserted a lock it never measured

### Security fix
- `src/components/AutonomousToolsModal.tsx` — the Finance Guard tab rendered the
  constant emerald badge `FINANCE SAFETY LOCK ACTIVE` / `100% EXCLUDED`. Both
  underlying engines (`isFinanceBlocked()`, `PermissionGuard.permanentBlock()`)
  are real, but nothing exercised them before the badge was painted, so the
  panel claimed an unobserved pass. The badge now derives its label, colour and
  detail line from the report the server actually returned.
- `server_tools.ts` — new `runFinanceGuardSelfCheck()` drives the shared probe
  corpus through both engines and returns per-probe observations.
- `server.ts` — `GET /api/security/finance-guard` returns the computed self-check
  report.
- `src/utils/financeGuardTruth.ts` — shared `FINANCE_GUARD_PROBES` corpus and the
  pure `summariseFinanceGuard()` tri-state: an empty or failed observation set is
  `UNKNOWN`, never `ENFORCED`; a single allowed probe is `GAP_DETECTED` and the
  detail names it.

### Added
- `src/tests/financeGuardTruth.test.ts` — 6 tests: the summariser tri-state, the
  end-to-end self-check observing a block for every probe, and per-surface
  assertions against both engines. Negative-validated: renaming a
  `FINANCE_KEYWORDS` entry fails 2 of 6.

---

## [Unreleased] - 2026-09-23 00:13 IST (2026-09-22 18:43 UTC) — credentials were shipped to the LLM in the memory context

### Security fix
- `src/utils/memory/aiContext.ts` — `assembleAiContext()` built the Gemini system
  prompt from `memoryState.name`, `memoryState.customKeyValues`, note titles and
  bodies, and the conversation history with **no redaction**. A token, API key or
  password stored in long-term memory, saved as a custom key/value, or typed in
  chat left for the model verbatim, in the outbound `generateContent` request.
  Every outbound string now passes through the existing `auditSecrets()` redactor
  by default; the call reports `redactedSecretsCount` and `redactedCategories`.
  Opt-out requires an explicit `redactCredentials: false`.
- `server.ts` — the memory-context call site now passes the real
  `securityMatrixState.credentialLeakProtection` flag and logs a warning naming
  the redacted categories when memory is scrubbed before an external call.
- `src/components/SecurityMatrixModal.tsx` — the row read the hardcoded literal
  `Zero Credential Leaks to LLM Memory — PROTECTED`; `credentialLeakProtection`
  had no reader anywhere in the codebase. The badge now renders `PROTECTED` /
  `DISABLED` / `UNKNOWN` from the observed state.

### Added
- `src/tests/llmContextLeakProtection.test.ts` — 7 tests covering note bodies,
  custom key/values, history, clean text that must pass through unchanged, the
  explicit opt-out, and a source guard that the badge is no longer a constant.
  Negative-validated: forcing redaction off fails 4 of 7.

---

## [Unreleased] - 2026-09-23 23:42 IST (18:12 UTC) — the Mobile Personal Status briefing card claimed TTS readiness and live telemetry it never observed

### Bug fix
- `src/components/MobilePersonalStatusModal.tsx` — the briefing hero card printed
  the constant string `SPEECH SYNTHESIZER READY` before the Web Speech API had
  been queried, and kept claiming readiness on platforms where
  `window.speechSynthesis` is unavailable. The spoken-script provenance line read
  `Generated from live telemetry reads` for every snapshot not flagged `isSample`,
  including the `null` snapshot left behind by a failed fetch where no read had
  completed.
- `src/App.tsx` — the real `speechDiagnostics` state and `isSpeaking` flag were
  never passed to `MobilePersonalStatusModal`; the card had no observed speech
  state to render. Both are now passed down.

### Added
- `src/utils/spokenBriefingTruth.ts` — pure helpers `speechReadiness` /
  `speechReadinessLabel` (tri-state: `UNKNOWN` until a diagnostics snapshot
  exists, then `READY` / `UNAVAILABLE` from the observed
  `speechSynthesisAvailable` boolean, and `READY` while an utterance is playing)
  and `briefingProvenance` / `briefingProvenanceLabel` (`UNKNOWN` for a `null`
  snapshot, `SAMPLE` for a fixture, `LIVE` only for a real read).
- `src/tests/spokenBriefingTruth.test.ts` — 7 tests, including source guards that
  pin the removed constant and the `live telemetry reads` literal.

### Verification
- Negative-validated: restoring both fabrications fails exactly 2 of 7
  (`2 failed | 5 passed`); restored → 7/7.
- Gates on `5f2a73f`: lint exit 0, vitest 73 files / 1028 tests passed, build
  exit 0 (`dist/server.cjs` 832.9 kb).
- Still `PARTIAL`: the sweep is pattern-driven and the speaking branch is
  unit-asserted, not exercised on a real speech platform in this sandbox.

---

## [Unreleased] - 2026-09-23 23:06 IST (17:36 UTC) — the Telegram Gateway panel asserted liveness and a cloud sync it never measured

### Bug fix
- `src/components/TelegramGatewayModal.tsx` — printed the seeded
  `config.botUsername` (the template `@HermesJarvisAssistantBot`, replaced with
  the real handle only after a successful `getMe`), labelled every non-live state
  `Real Telegram API (Long Polling)` including "status never fetched", and carried
  a fixed `24/7 Mobile Command` badge claiming messages "execute autonomously on
  your Oracle Cloud VM and sync live back to this matrix".
- `server.ts` — seeded `telegramConfig.totalMessagesReceived = 3`, so the panel
  opened reporting three never-received messages and the first real one displayed
  as the fourth. Now `0`; a new `botUsernameReported` flag records whether the
  handle actually came from the Telegram API.

### Added
- `src/utils/telegramGatewayTruth.ts` — pure tri-state liveness helper
  (`telegramStatusKnown` / `telegramLiveness` / `telegramLivenessLabel`) plus
  `telegramTokenLabel`, `telegramBotHandleLabel`, `telegramTransportLabel` and
  `telegramCloudSyncClaim()`, which make no host, connection or sync claim that
  was not observed.

### Changed
- The modal seeds `statusKnown = false`, stores the server config only when
  `telegramStatusKnown(data.config)` is a real boolean, and derives every liveness
  label from that gated value. Unanswered status reads `STATUS UNKNOWN`.

### Tests
- `src/tests/telegramGatewayTruth.test.ts` (12 tests, incl. source guards).
  Negative-validated: restoring the `24/7 Mobile Command` / Oracle copy fails
  exactly the source guard (`1 failed | 11 passed` of 12); restored → 12/12.
  Full suite: 71 files / 1014 tests passed.

---

## [Unreleased] - 2026-09-22 22:36 IST (17:06 UTC) — the Autonomous Tools Hub rendered an unfetched kill-switch state as green

### Bug fix
- `src/components/AutonomousToolsModal.tsx` — seeded its emergency state as
  `{ emergencyPaused: false }`, fetched `/api/emergency/status` inside a `try`
  block that swallowed failures, and rendered a constant green `DAEMON ACTIVE`
  badge for any state that was not paused. An unanswered status request thus
  read as a confirmed-released kill switch, and the two Level-3 controls
  (`Write File to Workspace`, `Queue for Human Approval`) were enabled on a value
  nobody had fetched. Non-boolean response shapes fell through the same branch.
  The same defect class was fixed on the Permission Gateway earlier this window.

### Changed
- The modal now seeds `null`, keeps a status only when `emergencyStatusKnown(data)`
  is true, renders `STATUS UNKNOWN` through the shared `src/utils/emergencyTruth.ts`
  tri-state, and derives `actionBlocked = loading || emergencyPaused || !statusKnown`
  so both Level-3 controls stay disabled while the state is unknown. The emergency
  toggle checks `res.ok` and the boolean shape, and on failure reports the error and
  resets to `null` instead of leaving a stale green badge.

### Tests
- `src/tests/autonomousToolsEmergencyLiveness.test.ts` (5 tests). Negative-validated:
  restoring the seed, the raw `disabled` reads and the constant badge fails exactly
  3 of 5.

## [Unreleased] - 2026-09-22 22:06 IST (16:36 UTC) — the live HTTP bridge route used its own weaker caller-ID mask

### Bug fix
- `server.ts` `/api/mobile/bridge/event` — carried an inline caller-number mask
  instead of the canonical engine helper:
  `String(payload.callerNumber).replace(/(\d{2,3})\d{4,6}(\d{3,4})/, '$1******$2')`.
  The pattern requires *contiguous* digits, so a number the device reports with
  spaces never matched and was echoed back to the audit trail completely
  unmasked — observed `'+1 415 890 2134'` unchanged. When it did match it was
  also too weak: `'+91 9876543210'` → `'+91 987******210'`, exposing the leading
  digits and four more of the subscriber number. Slot 2 repaired the canonical
  `maskPhoneNumber` but not this route, which is the one that actually handles
  device events.

### Added
- `src/utils/androidBridgePrivacy.ts` — `maskAndroidCallerNumber`, a thin
  wrapper over the canonical `maskPhoneNumber` that returns `undefined` when no
  identifier was reported. The route now uses it: observed
  `'+1 415 890 2134'` → `'+1 ******2134'`, `'+91 9876543210'` →
  `'+91 ******3210'`, `'Unknown'` → `'Unknown Number'`.

### Tests
- `src/tests/androidBridgeHttpPrivacy.test.ts` (7 tests) — pins the helper's
  output on the inputs the old regex mishandled, and guards against the inline
  contiguous-digit regex returning. Negative-validated: restoring the inline
  regex fails 2 of 7.

### Verified
- lint (`tsc --noEmit`) exit 0 · `npx vitest run` 69 files / 997 tests passed ·
  `npm run build` exit 0 (`dist/server.cjs` 852719 bytes; `dist/` removed after
  measuring, never committed).

---

## [Unreleased] - 2026-09-22 21:35 IST (16:05 UTC) — the Android bridge no longer fabricates a masked number from a caller label

### Bug fix
- `src/utils/androidBridgeEngine.ts` `maskPhoneNumber` — sliced the last four
  *characters* of its input without checking for digits. A digit-free caller
  label came back as a fragment of itself (`'Unknown'` → `'******nown'`,
  `'UNKNOWN'` → `'******NOWN'`, `'private'` → `'******vate'`), leaking label
  characters in phone-number shape. This is the live path: the route calls
  `maskPhoneNumber(payload.callerNumber || 'Unknown')` when the bridge reports a
  call with no resolvable number. A real spaced number was also mis-rendered
  (`'+1 415 890 2134'` → `'+1  ******2134'`, double space) because the prefix was
  `clean.slice(0, 3)` plus an appended space. Now digits are extracted first: a
  digit-free input returns `'Unknown Number'`, and a real number keeps its
  matched `+<area> ` prefix and last four digits with spacing normalised
  (`'+91-9876543210'` → `'+91 ******3210'`).
- `src/utils/telephonyPermissions.ts` was checked and does not share the
  digit-free path — it already returns `'Unknown / Private'`. No change needed.

### Tests
- `src/tests/androidMobileBridge.test.ts` — two new scenarios (19–20; file now
  39 tests, up from 37) covering the digit-free identifier and the
  country-prefix preservation. Negative-validated: restoring the pre-fix body
  fails exactly those two (`2 failed | 37 passed` of 39, observed
  `expected '******nown' to be 'Unknown Number'` and
  `expected '+1  ******2134' to be '+1 ******2134'`); all 39 pass with the fix.

### Verification
- `npm run lint` (`tsc --noEmit`) exit 0; `npx vitest run` 68 files / 990 tests
  passed (20.47 s); `npm run build` exit 0 (`dist/server.cjs` 852583 bytes,
  `dist/` removed after measuring and never committed). Item 54 remains `PARTIAL`.

---

## [Unreleased] - 2026-09-22 21:06 IST (15:36 UTC) — The first-launch chat transcript no longer claims a cloud sync

### Bug fix
- `src/utils/offlineStorage.ts` `defaultInitialMessages` — the seed chat history
  that `App.tsx` renders when `localStorage` holds no transcript opened with
  `HERMES JARVIS PROTOCOL ACTIVE. Local offline storage initialized & synced with
  Oracle Cloud Always Free ARM node.` No sync route exists in this build, the
  `PendingSyncItem` queue is never drained to a remote, and the process runs in
  this container, not the Oracle ARM VM. The system message now reads that cloud
  sync is NOT configured, and the same file's seed memory note no longer hardcodes
  an `Oracle Always Free ARM64` deployment or a `Backend Sync` persistence mode.

### Tests
- `src/tests/offlineStorage.test.ts` — three new cases (7 in file, up from 4):
  the seed message says cloud sync is not configured, no seed message matches
  `synced with` / `Oracle Cloud` / `ARM node`, and a source guard pins the absence
  of the fabricated string. Negative-validated: restoring the original line fails
  exactly those three (`3 failed | 4 passed` of 7); all 7 pass with the fix.

### Verification
- `npm run lint` (`tsc --noEmit`) exit 0; `npx vitest run` 68 files / 987 tests
  passed (19.41 s); `npm run build` exit 0 (`dist/server.cjs` 852453 bytes /
  832.5 kb, `dist/` removed after measuring). Item 13 remains `PARTIAL`.

## [Unreleased] - 2026-09-22 04:35 IST (2026-09-21 23:07 UTC) — Window finalization (no code change)

### Verification
- Frozen tip `499045e` re-verified end to end: `npm run lint` (`tsc --noEmit`)
  exit 0; `npx vitest run` 68 files / 984 tests passed (19.91 s); `npm run build`
  exit 0 (`dist/server.cjs` 852453 bytes / 832.5 kb).
- Security: `.env` git-ignored and untracked; `git status --short` clean; ignored
  paths limited to `dist/` and `node_modules/`; secret-pattern scan of
  `git diff origin/main` returns only the documented synthetic fixtures/tests.
- No new development started. #31 remains `PARTIAL`; blocked set unchanged
  (#1/#2/#50/#55 physical Android device, #8 Windows host). PR #4 left open,
  non-draft, mergeable; `main` not merged — awaits human approval.

## [Unreleased] - 2026-09-22 04:05 IST (2026-09-21 22:36 UTC) — A handed-off reply is no longer logged as a confirmed delivery

### Bug fix
- `MobileBridgeModal.tsx` `dispatchReply` — after the 03:35 IST slot stopped it
  fabricating its approval, its outcome handling still read a success. On the
  positive branch it set the pending event `EXECUTED` and wrote
  `result: 'SUCCESS'` into the mobile audit log, but the only server answer that
  takes that branch is `DISPATCHED, verified: false`. A reply handed to the
  bridge is not a reply the handset confirmed — confirmation arrives only through
  the separate `/api/mobile/bridge/action/confirm` route — so the queue showed a
  delivered reply and the audit log recorded an irreversible success neither of
  which had happened.

### Fix
- `src/utils/mobileReplyDispatchTruth.ts` gains `replyEventStatusForOutcome`
  (`DISPATCHED`/`UNVERIFIED` → `AUTHORIZED`; `BLOCKED` → `REJECTED`;
  `NOT_CONFIGURED` → `PENDING_APPROVAL`; else `FAILED`) and
  `replyAuditProjection` (`DISPATCHED`/`UNVERIFIED` → `REPLY_APPROVED` /
  `UNVERIFIED`; `BLOCKED` → `ACTION_DENIED` / `DENIED`; `NOT_CONFIGURED` →
  `CAPABILITY_UNAVAILABLE` / `UNAVAILABLE`).
- `MobileBridgeModal.tsx` derives the queue status and the audit entry from the
  observed outcome, so only `action/confirm` can record `EXECUTED`/`SUCCESS`.
- The queue renders `AUTHORIZED — AWAITING DEVICE CONFIRMATION` and `EXECUTED`
  as `CONFIRMED BY DEVICE`, so the screen names which state is actually known.
- `src/types/mobileBridge.ts` `MobileAuditEntry.result` gains `UNVERIFIED`.

### Tests
- `src/tests/mobileReplyDispatchTruth.test.ts` 16 → 21 tests, covering both
  projections and pinning the absence of the old expressions. Negative-validated:
  the old expressions restored fail exactly one guard (`1 failed | 20 passed`).

---
## [Unreleased] - 2026-09-22 03:35 IST (2026-09-21 22:05 UTC) — Mobile reply dispatch no longer fabricates its approval or its result

### Bug fix
- `MobileBridgeModal.tsx` `dispatchReply` — the REPLY control on every pending
  mobile-bridge event — asked for no approval, sent no request, and marked the
  event `AUTHORIZED` while speaking "Reply authorized, Sir. Dispatching via the
  Android bridge when connected." Its approval expression was
  `isExplicitApproval('yes') ? 'REPLY_AUTHORIZED' : 'REPLY_AUTHORIZED'`: both
  branches identical, so the computed answer was discarded, and
  `isExplicitApproval` was never called with anything a user had said. The route
  the speech described, `/api/mobile/bridge/message/reply`, refuses every request
  lacking `approved: true`, so each of those "dispatches" claimed an HTTP call
  that nobody made.

### Fix
- New `src/utils/mobileReplyDispatchTruth.ts`: `replyDispatchDecision(...)` is a
  pure gate that refuses with `NOT_REPLY_EVENT`, `SENSITIVE_CONTENT`,
  `NO_REPLY_TEXT` or `NO_DISTINCT_APPROVAL` and otherwise returns the verified
  body and notification id; `replyDispatchOutcome(httpStatus, body)` maps the
  *observed* response to `DISPATCHED | BLOCKED | FAILED | NOT_CONFIGURED |
  UNVERIFIED` and never infers success from a transport status (any 2xx without
  the server's dispatch outcome is `FAILED`; a device-claimed `verified` is
  demoted to `UNVERIFIED`, because confirmation is a separate route); and
  English/Hindi `replyDispatchSpeech` / `replyRefusalSpeech` that never say a
  reply was delivered.
- `MobileBridgeModal.tsx` now provides a reply text field and a distinct
  `I APPROVE SENDING THIS REPLY` checkbox. Without that approval nothing is
  requested and the event stays `PENDING_APPROVAL` — never `AUTHORIZED`. With no
  paired bridge session token it reports `NOT_CONFIGURED` rather than pretending.
  Otherwise it POSTs the real request and drives the event status, the audit
  entry, the on-screen notice and the spoken line from the status and body it
  actually received.

### Tests
- New `src/tests/mobileReplyDispatchTruth.test.ts` (16 tests): the four refusal
  reasons, the approval requirement, and the outcome mapping over 0/4xx/5xx/2xx
  bodies, plus source guards pinning the absence of the identical-branch ternary,
  the absence of an unsupervised `AUTHORIZED` write, and the presence of the real
  route call. Negative-validated: restoring the previous `MobileBridgeModal.tsx`
  fails exactly the 3 source guards (`3 failed | 13 passed`); restored → 16/16.
  Full suite 68 files / 979 tests passed; lint exit 0; build exit 0.



## [Unreleased] - 2026-09-22 03:05 IST (2026-09-21 21:35 UTC) — Permission Gateway no longer asserts an unqueried kill-switch state

### Bug fix
- `PermissionGateway.tsx` is the screen a human reads before approving an
  irreversible Level 4 action, and its emergency pill, lockout banner and
  approval button were all driven by `emergency.emergencyPaused`. The component
  seeded that state as `{ emergencyPaused: false }` and fetched
  `/api/emergency/status` inside the same `try` block as the approval queue
  lists, so a failed status request was swallowed and the initial "not paused"
  value stood. The result was a green `ACTIVE` badge, no banner, and an enabled
  `YES / APPROVE & EXECUTE` button on the strength of a value nobody had
  fetched. A payload whose `emergencyPaused` was not a boolean fell through to
  the same green branch.

### Fix
- New `src/utils/emergencyTruth.ts`: pure tri-state
  (`emergencyLiveness` → `ACTIVE | ENGAGED | UNKNOWN`, plus
  `emergencyStatusKnown` and `emergencyLivenessLabel`). `UNKNOWN` until a real
  boolean has been observed, so an unqueried value can never read as healthy.
- `PermissionGateway.tsx` seeds the emergency state as `null` and fetches the
  status in its own `try` block whose failure leaves liveness at `UNKNOWN` — it
  can no longer silently resolve to "not paused". The header renders an explicit
  `STATUS UNKNOWN` badge with a matching banner, and
  `approvalBlocked = killSwitchEngaged || !statusKnown` disables
  `YES / APPROVE & EXECUTE` and makes `handleApprove()` return early while the
  state is unknown. No render path reads `emergency.emergencyPaused` any more.

### Tests
- New `src/tests/permissionGatewayEmergencyLiveness.test.ts` (9 cases): the
  tri-state over `null` / `undefined` / missing-boolean / paused / hard-switch,
  `emergencyStatusKnown`, that an unobserved status is never `ACTIVE`, the
  labels, and source guards pinning the `null` seed, the derived
  `approvalBlocked`, the fail-closed `!statusKnown` early return and the absence
  of the raw flag read. Negative-validated: restoring a single raw read makes
  the source guard fail (`1 failed | 8 passed`); restored → 9/9. Full suite
  `67 files / 963 tests passed`; lint (`tsc --noEmit`) exit 0; build exit 0
  (`dist/server.cjs` 852453 bytes).

---
## [Unreleased] - 2026-09-22 02:35 IST (2026-09-21 21:05 UTC) — Level-4 safety gate enforced on the host dispatch path

### Bug fix
- `HostActionExecutor.execute()` in `src/utils/computerOperator/actionExecutorHost.ts`
  contained no `PermissionGuard` call. The executor that actually shells out to
  the OS resolved the workspace path and ran the command, so a `TERMINAL_COMMAND`
  whose text was financial (`transfer money to the client`) was executed by the
  real shell. The same executor accepted an `approved` flag and used it to lift
  the Level-4 approval gate, so a single approval could carry a finance action
  through. The earlier keyword sweeps hardened the guard's word list but the
  executor never consulted the guard at all.

### Fix
- `PermissionGuard.permanentBlock()` is now the single owner of the
  never-permissible categories: emergency stop, the Level-4 finance exclusion,
  and security bypass. `PermissionGuard.evaluateHostSafety()` and the
  browser-side `ActionExecutor.forwardToHost()` both call it, and the duplicated
  section-4 block was removed from `evaluateAction()`.
- `HostActionExecutor.safetyRefusal()` gates every dispatch: a held destructive
  command returns `PERMISSION_REQUIRED`, everything else permanent returns
  `BLOCKED`, and `approved: true` cannot lift the finance exclusion.
- `server.ts`'s `emergencyActive()` delegates to the shared
  `isEmergencyStopActive()` in `src/utils/hardening/emergencyStop.ts`.

### Tests
- New `HostActionExecutor — Level-4 safety gate (item 51)` block in
  `src/tests/hostActionExecutor.test.ts` (6 cases). Negative-validated: disabling
  the gate fails exactly 5 of 6 (`5 failed | 39 passed` of 44), all 44 pass with
  it restored. Full suite `66 files / 954 tests passed`; build exit 0
  (`dist/server.cjs` 852453 bytes).

---
## [Unreleased] - 2026-09-22 02:06 IST (2026-09-21 20:36 UTC) — Finance exclusion gate closed for "transfer money"

### Bug fix
- `isFinanceBlocked()` in `server_tools.ts` listed `'money transfer'` but not
  `'transfer money'`, so `isFinanceBlocked('transfer money to the client')`
  returned `blocked: false`. This filter is what `createPendingActionRequest`
  consults to refuse a finance action outright, before the approval path is
  offered, so the most natural English phrasing of a fund transfer slipped past
  the strict exclusion. `src/utils/computerOperator/permissionGuard.ts` had the
  same gap and had dropped even `'money transfer'`.

### Fix
- Both keyword lists now include `'transfer money'`, `'transfer funds'`,
  `'send funds'`, `'move money'` and `'transfer rupees'`.
- Follow-up in the same slot: a parity case added to `permissionGuard.test.ts`
  (five natural-language phrasings) proved the Computer Operator list was still
  missing `'move money'` and `'transfer rupees'` — `evaluateAction` returned
  `allowed: true` for both. Keyword list extended; the two finance files went
  from `2 failed | 25 passed` to `27 passed (27)`.

### Tests
- New `src/tests/financeGuard.test.ts` (13 tests) — the first direct coverage
  of `isFinanceBlocked` plus the finance-reject, emergency-stop,
  `PENDING_APPROVAL` and Level 3 label paths of `createPendingActionRequest`.
- `src/tests/permissionGuard.test.ts` — added 5 natural-language finance cases.
- Negative-validated with observed counts: removing the new keywords from
  `isFinanceBlocked()` fails **1 of 13** `financeGuard.test.ts` cases
  (`1 failed | 12 passed`), restored to 13/13; removing them from
  `FINANCE_KEYWORDS` fails 2 `permissionGuard.test.ts` cases, restored to 9/9.
- Full suite: 66 files / 948 tests passed; lint `tsc --noEmit` exit 0; build
  exit 0 (`dist/server.cjs` 847117 bytes / 827.3 kb).

---
## [Unreleased] - 2026-09-22 01:36 IST (2026-09-21 20:06 UTC) — No working email sender is reported

### Bug fix
- The outbound email surface reported a live sender that does not exist.
  `realEmailStatus()` set `configured: true` from the mere presence of
  `GMAIL_USER` + `GMAIL_APP_PASSWORD` and spoke *"SMTP Transport Active. Level 4
  confirmation required for all sends."*; the Integrations Matrix `email` entry
  was hardcoded `REAL_WORKING` with the reason *"SMTP Conduit verified for client
  notifications and quotations"* and capabilities `Quotation Email Dispatch` /
  `Client Inquiries`; and `AutonomousToolsModal.tsx` drew an emerald `READY`
  badge and green panel border from that flag. No SMTP client, socket, or send
  route exists in this build.

### Fix
- New `src/utils/emailConduitTruth.ts`: `isEmailTransportImplemented()` is the
  single switch to flip when a real sender ships, `describeEmailConduit()`
  returns `NOT_CONFIGURED` / `CREDENTIALS_PRESENT_NO_TRANSPORT` with a badge
  label of `CREDENTIALS ONLY — NO SENDER`, and `EMAIL_CAPABILITY_NOTE` states
  plainly that the transport is not implemented.
- `realEmailStatus()` now returns `status` + `transportImplemented` alongside the
  credential flags; the `email` integration entry is pinned `NOT_AVAILABLE` with
  a reason that never claims verification.

### Test
- `src/tests/emailConduitTruthfulness.test.ts` (6 tests) pins the credential-only
  labelling and the absence of any transport claim. Negative-validated: flipping
  `isEmailTransportImplemented()` to `true` fails exactly 3 of the 6 tests.

---
## [Unreleased] - 2026-09-22 01:05 IST (2026-09-21 19:36 UTC) — Android app launch no longer reports false success

### Bug fix
- `AndroidBridgeManager.openApplication()` recorded an `APP_OPENED` audit event
  with `result: 'UNSUPPORTED'` but performed no gating, and
  `SimulatedAndroidAdapter.openApp()` returned a hardcoded `success: true`.
  A launch could therefore be presented as done on a disconnected bridge, under
  the Global Kill Switch, or on a device without launch capability.

### Fix
- `openApplication()` checks four real gates — bridge connected with a capability
  handshake, emergency stop, device `canOpenApp`, and the app privacy rule — and
  returns `success: false` with a `blockedReason` on every path. Each refusal is
  audited with the matching result; a privacy-denied app now records
  `ACTION_DENIED` rather than `APP_OPENED`.
- `SimulatedAndroidAdapter.openApp()` delegates to the engine instead of
  asserting success, and `App.tsx`'s `handleOpenMobileApp` speaks the real result.

### Test
- `src/tests/androidMobileBridge.test.ts` Scenarios 17–18 cover disconnected,
  emergency stop, unsupported capability, privacy-denied and
  dispatched-but-unconfirmed paths. Negative-validated: removing the connection
  gate fails Scenario 17 (1 failed | 36 skipped).

---
## [Unreleased] - 2026-09-22 00:36 IST (2026-09-21 19:06 UTC) — Computer Operator panel no longer claims an unmeasured screen

### Bug fix
- `ComputerOperatorModal.tsx` drew a green dot with the literal
  `STANDBY: SCREEN SYNCHRONIZED` from the mere absence of a running task, even
  when the host desktop could not be observed (`probeHostState()` returns
  `observed: false` on a headless host).
- The same panel's resolution badge rendered `0x0` for an unobservable host, and
  a field labelled `Resolution:` displayed `currentObservation?.platform ||
  'linux-arm64'` — a platform name presented as a measured dimension.

### Fix
- New `src/utils/computerOperator/observationTruth.ts`: `screenSyncState()` /
  `screenSyncLabel()` hold at `ILLUSTRATIVE` (built-in preview) or `UNOBSERVED`
  (absent/ambiguous observation) and report `SCREEN OBSERVED FROM HOST` only for
  a genuine observation; `observationResolutionLabel()` returns `UNKNOWN` rather
  than `0x0`; `observationPlatformLabel()` labels the platform as a platform;
  `observationAmbiguityNotice()` surfaces the host's own `ambiguityReason`.
- The status dot is red for `UNOBSERVED`, grey for `ILLUSTRATIVE`, never green.

### Tests
- `src/tests/observationTruth.test.ts` — 19 tests over the helpers plus source
  guards on the removed literals. Negative-validated: reintroducing
  `STANDBY: SCREEN SYNCHRONIZED` fails exactly the source guard (1 failed | 18
  passed); restored to 19/19.
- Gates on `61ad02e`: lint (`tsc --noEmit`) exit 0, vitest 64 files / 922 tests
  passed, build exit 0 (`dist/server.cjs` 843115 bytes / 823.4 kb).

---
## [Unreleased] - 2026-09-22 00:17 IST (2026-09-21 18:47 UTC) — Social credential presence is no longer reported as a live connection

### Bug fix
- `/api/social/platforms` (`getPlatformIntegrationsStatus`) labelled a platform
  `CONNECTED` — and YouTube `API_VERIFIED` with `canPublish: true` — from the mere
  presence of credentials, although the endpoint makes no provider call and cannot
  certify a live account. The Social Hub then drew a green connected badge and a
  member/channel banner from that unmeasured label.
- `/api/auth/youtube/status` returned `connected: true` / `status: 'API_VERIFIED'`
  / `canPublish: true` for a static `YOUTUBE_ACCESS_TOKEN` that had never been
  probed against Google.

### Fix
- A credential-bearing platform is now reported `CONFIGURED` with an explicit
  *"Credentials present but not verified. Run "Test connection"..."* message
  (`CRED_STATUS`/`CRED_MESSAGE` in `server.ts`). A live connection is only ever
  proven by `/api/social/platforms/test`.
- YouTube `canPublish` is `false` on `/api/social/platforms` until a probe
  confirms the channel, and the static-token branch of `/api/auth/youtube/status`
  now returns `connected: false` / `CONFIGURED` / `canPublish: false`.
- Guarded by 4 new cases in `src/tests/toolSurfaceTruthfulness.test.ts`;
  negative-validated by reintroducing the `'CONNECTED'` literal (observed
  **1 failed | 27 passed**), restored to 28/28.

## [Unreleased] - 2026-09-21 23:35 IST (18:05 UTC) — Social Hub stops reporting connections and approvals it never measured

### Bug fix
- `SocialMediaModal.tsx` labelled any platform whose credentials were merely
  present as `CONNECTED` and rendered a green badge from that label. Presence of
  a token is not a live connection — the server only learns a token still works
  when a provider call is made.
- `handleTestConnection` took `success: true` at face value and spoke
  "<platform> connection verified live" without reading the provider's own
  `status` field or the account name.
- The modal header printed `Level 4 Approval Active` without ever fetching
  `/api/security`; the YouTube studio repeated a literal Level-4 claim.
- The YouTube approve path claimed a verified upload from `success: true` even
  when no provider video ID was returned.

### Fix
- New `src/utils/socialPublishHonesty.ts`: `classifyProviderTestResponse`
  accepts a result as `OK` only for `success: true` + `status: 'VERIFIED'` + a
  non-empty `accountName`; everything else maps to `NOT_CONFIGURED`,
  `RECONNECT`, `FAILED` or `UNCONFIRMED`. `connectionStatusLabel` describes a
  present credential as "Credentials present — live connection not yet
  verified", and `socialApprovalPostureLabel` renders the fetched permission
  level or says the posture is unknown.
- `SocialMediaModal.tsx` derives status badges, the probe card and the spoken
  confirmation from the measured verdict, and requires a provider video ID
  before reporting a verified YouTube upload.

### Tests
- `src/tests/socialPublishHonesty.test.ts` — 13 tests. Negative-validated:
  reverting the `VERIFIED`/account guard fails exactly 2 of 13 and the suite
  passes 13/13 with it restored.
- Full suite: 63 files / 899 tests passed. Lint exit 0, build exit 0.

---
## [Unreleased] - 2026-09-21 23:10 IST (17:40 UTC) — Telephony UI no longer advertises a webhook route the server never registers

### Bug fix
- `TelephonyHubModal.tsx` listed `POST /api/telephony/twiml/voice` as
  `TwiML ACTIVE`, and `TwilioTelephonyProvider.startOutboundCall` in
  `src/utils/telephonyAdapters.ts` used that same path as its post-answer
  callback. `server.ts` registers only `/api/telephony/incoming`,
  `/api/telephony/handle-turn` and `/api/telephony/twiml/turn`, so a carrier
  following the advertised callback would have reached a 404.
- All three endpoint badges (`LIVE & READY`, `TwiML ACTIVE`,
  `GEMINI BRAIN READY`) and `BlueprintRoadmapModal.tsx`'s
  `Security Matrix: Active` footer were hardcoded, asserting liveness and a
  security posture no code path measured.
- Fix: new `src/utils/telephonyEndpointTruth.ts` exports the registered-route
  inventory, `telephonyEndpointLabel()` (returns `NO SUCH ROUTE` for an
  unregistered path, holds readiness at `UNKNOWN` until the status request
  answers) and `telephonyBrainLabel()` (derives state from `/api/health`'s
  measured `geminiEnabled`). The Twilio adapter callback targets the real turn
  route; the Security Matrix footer no longer asserts a posture it never queried.
- Evidence: `npx vitest run src/tests/telephonyEndpointTruth.test.ts` → 11 passed;
  negative-validated by restoring the non-existent path (1 failed | 10 passed),
  then restored. `npm run lint` exit 0; `npx vitest run` → 62 files / 882 tests
  passed; `npm run build` exit 0 (`dist/server.cjs` 842396 bytes / 822.7 kb).

---
## [Unreleased] - 2026-09-21 22:36 IST (17:06 UTC) — TTS diagnostics no longer report a speech action that failed

### Bug fix
- `buildSpeechDiagnostics` in `src/utils/speechTtsEngine.ts` returned
  `statusMessage: "TTS Active: <voice>"` whenever a voice resolved, and claimed
  `speechSynthesisAvailable: true` even where `window.speechSynthesis` does not
  exist. A selected voice is not a spoken utterance.
- `src/App.tsx` handled `utterance.onerror` (and the `speak()` catch) by writing
  only `ttsErrorState`, leaving the stale `TTS Active: <voice>` string visible in
  the Settings diagnostics — a shown failure contradicted by a shown success, on
  the surface the operator uses to judge whether JARVIS can speak.
- Fix: an unsupported platform now reports unsupported; a merely selected voice
  reports `... not yet confirmed by playback`; the new
  `applySpeechErrorToDiagnostics()` rewrites the stale status to
  `Speech error: <code>` while preserving the rest of the snapshot, and both
  error paths route through it.
- Evidence: `npx vitest run src/tests/speechTtsEngine.test.ts` → 30 passed
  (5 new); negative-validated twice. `npm run lint` exit 0;
  `npx vitest run` → 61 files / 871 tests passed; `npm run build` exit 0.

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
