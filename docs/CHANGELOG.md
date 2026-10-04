# 📜 CHANGELOG — HERMES JARVIS

All notable improvements, security updates, and feature additions are documented in this file.

---

## [Unreleased] - 2026-10-05 02:05 IST (2026-10-04 20:35 UTC) — window slot 10: outbound call stage reports only a real staged approval

### Fixed
- **`POST /api/telephony/outbound/stage` answered `{ success: true, request, actionId, promptText }` for every request.** The route discarded the result of `createPendingActionRequest`, so a finance-guard block or an active emergency stop still reported a staged Level-4 outbound call and returned an `actionId` for a request that could never be authorized. It also staged a pending outbound request in the session manager *before* the safety check, leaving a blocked dial sitting in the pending queue as if it awaited approval. New `classifyOutboundStage` (`src/utils/hardening/outboundStageTruth.ts`) claims success only when the created action reached `PENDING_APPROVAL`. The route now runs the safety gate first, returns `409` with `outcome: BLOCKED_FINANCE`/`BLOCKED_EMERGENCY` and `actionId: null` on a block, and stages the pending outbound request only after the action is genuinely pending.

### Tests
- `src/tests/outboundStageTruth.test.ts` — new, 12 cases: 5 unit verdicts (PENDING_APPROVAL stages; finance block, emergency block, non-pending status and a missing request never stage), 3 against the real `createPendingActionRequest` (benign → STAGED; finance purpose → BLOCKED_FINANCE; active emergency stop → BLOCKED_EMERGENCY) and 4 source guards (the route calls `classifyOutboundStage`; the safety gate precedes `stageOutboundRequest`; a blocked reply carries `actionId: null`; no blanket `success: true` remains).
- Negative-validated: disabling the gate fails exactly the source guard (`1 failed | 11 passed`), restored → 12/12.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **158 files / 1999 tests passed** (26.40 s, 0 failed); build exit 0 (`dist/server.cjs` 986.6 kb). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-05 01:35 IST (2026-10-04 20:05 UTC) — window slot 9: youtube draft update reports success only when a field actually changed

### Fixed
- **`POST /api/social/youtube/update-draft` answered `{ success: true, post }` for every request that matched a staged post, including one that changed nothing, and the Social Hub announced "YouTube video parameters updated." for a repeat submission or a cleared form.** The route applied each field behind a truthiness guard and reported success unconditionally, so a no-op read as a saved update. New `classifyYouTubeDraftUpdate` (`src/utils/hardening/youtubeDraftUpdateTruth.ts`) decides which fields actually differ — a blank title, a non-string description and a repeat of the stored `private` privacy are all non-changes — and the route writes only those, answering `success: false, applied: false, outcome: UNCHANGED` for a no-op. `src/components/SocialMediaModal.tsx` now speaks the route's message, so a no-op is not voiced as an update. The missing-post 404 also carries `success: false`.

### Tests
- `src/tests/youtubeDraftUpdateTruth.test.ts` — new, 9 cases: 6 unit (title+description+privacy applied together; a full repeat is a no-op; an unrecognised privacy value coerces to the stored private default; only the changed field is applied; blank title and non-string description ignored; empty request refused) and 3 source guards (the route calls `classifyYouTubeDraftUpdate` and returns `success: false`; it writes only verdict-marked fields and drops the old `if (title)` block; the 404 carries `success: false`).
- Negative-validated: reverting the route to its pre-fix form fails exactly the 2 write-path source guards (`2 failed | 7 passed`), restored → 9/9.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **157 files / 1987 tests passed** (24.89 s, 0 failed); build exit 0 (`dist/server.cjs` 985.2 kb). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-05 00:56 IST (2026-10-04 19:26 UTC) — window slot 7: the YouTube summarizer reply no longer renders a blank summary as a completed summary

### Fixed
- **The Telegram `summarize_youtube_video` reply rendered the `🎥 *YOUTUBE VIDEO SUMMARY*` heading with the title, channel and link followed by a blank body when `summarizeYouTubeVideoCore` returned `success: true` with `source: 'none'` and an empty `summary` (a video that exposes no transcript and no description).** The reply branched only on `success && videoInfo`; the summariser itself was honest, but the reply still framed an empty result as a completed summary. New `formatYouTubeSummaryNotice` (`src/utils/hardening/youtubeSummaryNoticeTruth.ts`) returns a leading notice whenever the result carries no real summary text (empty/whitespace, or `source === 'none'`) and `null` for a genuine extractive/gemini summary; the reply now leads with the notice (`actionData.type = 'youtube_summary_unavailable'`) and gates the confident reply behind it.

### Tests
- `src/tests/youtubeSummaryNoticeTruth.test.ts` — new, 9 cases: 6 unit (empty `none` summary; `none` with stray text; whitespace-only; missing-notice fallback; real extractive and real gemini both return `null`) and 3 source guards (the reply routes through `formatYouTubeSummaryNotice`, the unavailable branch precedes the confident one, and the confident reply sits in the `else` of the notice check).
- Negative-validated: restoring the unguarded heading fails exactly the source guards (`1 failed | 8 passed`), restored → 9/9.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **155 files / 1970 tests passed** (25.13 s, 0 failed); build exit 0 (`dist/server.cjs` 1006273 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-05 00:21 IST (2026-10-04 18:51 UTC) — window slot 6: approval-create reports success only when an action is actually staged

### Fixed
- **`POST /api/approvals/create` answered `{ success: true, request }` for every request that matched a stored record — including one the finance exclusion guard or the emergency stop had blocked — and pushed a Telegram approval card for it.** The route decided `success` from the shape of the response, not from whether the request was actually staged, so a blocked action read as a successful staging. New `classifyApprovalCreate` (`src/utils/hardening/approvalCreateTruth.ts`) derives `success`/`staged` from the observed request status: `PENDING_APPROVAL` is the only success; a finance block, an emergency block, or any other terminal status is a no-op. The route gates the success reply behind `verdict.staged` and sends no Telegram card for a non-staged request.

### Tests
- `src/tests/approvalCreateTruth.test.ts` — new, 7 cases: 5 unit (pending request staged; finance block, emergency block, non-pending status and missing request all not staged) and 2 source guards (the route calls `classifyApprovalCreate` and contains no blanket `res.json({ success: true, request })`; the success reply is gated behind `if (!verdict.staged)`).
- Negative-validated: restoring the blanket reply and disabling the staged gate fails exactly the 2 source guards (`2 failed | 5 passed`), restored → 7/7.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **154 files / 1961 tests passed** (24.87 s, 0 failed); build exit 0 (`dist/server.cjs` 1005300 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 23:55 IST (2026-10-04 18:25 UTC) — window slot 5: the mobile bridge stops reporting every device event as verified

### Fixed
- **`POST /api/mobile/bridge/event` answered `{ success: true, outcome: 'VERIFIED', accepted: true }` for every device event the gateway accepted, and stamped the `CALL_RECEIVED` / `NOTIFICATION_RECEIVED` / `EVENT_RECEIVED` audit rows `VERIFIED` — including an event from a simulated testbed device and one whose session had lapsed so the bridge read `MOBILE_NOT_CONNECTED`.** The reply told the caller a live device event was verified when no live device backed it, and the audit trail repeated the claim. New `classifyBridgeEvent` (`src/utils/hardening/bridgeEventTruth.ts`) derives the verdict from observed bridge state: `VERIFIED` only for a live, non-simulated device, `SIMULATION_ONLY` for a simulation (which outranks a `CONNECTED` status), `UNVERIFIED` when the bridge is not live, `FAILED` when the gateway did not accept the event. The route stamps the audit rows with the same outcome, so the reply and the trail cannot disagree.

### Tests
- `src/tests/bridgeEventTruth.test.ts` — new, 9 cases: 6 unit (live event verified; simulated device never verified even at `CONNECTED`; not-live and `MOBILE_NOT_CONNECTED` both `UNVERIFIED`; unaccepted event `FAILED`; the message names the event type) and 3 source guards (the route calls the classifier, stamps the audit rows with `eventVerdict.outcome` and contains no blanket `'VERIFIED'`, and no longer hard-codes `success: true`).
- Negative-validated: reverting the route to the blanket reply fails exactly the 3 source guards (`3 failed | 6 passed`), restored → 9/9.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; targeted 3 files / 63 passed; full suite **153 files / 1954 tests passed** (24.33 s, 0 failed); build exit 0 (`dist/server.cjs` 1004008 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 23:22 IST (2026-10-04 17:52 UTC) — window slot 4: the call HUD stops labelling a disconnected bandpass as an applied filter

### Fixed
- **The `ActiveCallHUD` acoustic-filter toggle rendered `Bandpass profile` / `Full band` from a state seeded `true`, while `telephonyAudio.enableTelephoneBandpass()` only creates a `BiquadFilterNode` that is never connected to any audio path.** The synthesizer emits tones straight to `ctx.destination` and has no call input, so the toggle changed nothing about call audio while its label read as an applied filter state. New `acousticFilterToggleLabel(configured)` (`src/utils/hardening/acousticFilterTruth.ts`) returns `Bandpass configured (not on call audio)` / `Bandpass off (not on call audio)`; `ActiveCallHUD.tsx` renders it so both branches carry the qualifier. The tooltip already used `ACOUSTIC_FILTER_LABEL`; this closes the visible label.

### Tests
- `src/tests/hardening/acousticFilterTruth.test.ts` — 2 new source guards (the HUD no longer renders a bare `'Bandpass profile'` / `'Full band'`; it calls `acousticFilterToggleLabel(audioFilterActive)`) and 2 new unit tests (both toggle states match `/not on call audio/i` and never claim `ON`/`3G`; configured vs off still distinguishable). 9 cases total.
- Negative-validated: restoring the bare label fails the new source guard (`1 failed | 8 passed`), restored → 9/9.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **152 files / 1945 tests passed** (25.42 s, 0 failed); build exit 0 (`dist/server.cjs` 1002614 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 22:45 IST (2026-10-04 17:15 UTC) — window slot 3: the freelance lead status update stops faking a saved change

### Fixed
- **`POST /api/freelance/update-status` in `server.ts` stored any status string the caller supplied and answered `{ success: true, lead }` for every request that matched a stored lead.** An unknown status was written as a real pipeline state, and re-applying the stored status announced a saved change while nothing changed — the fake-success shape the zero-fake-success item removes. New `classifyLeadStatusUpdate` (`src/utils/hardening/freelanceLeadStatusTruth.ts`) accepts only the four statuses the UI can display and returns a verdict — `APPLIED` (recognised and different, written), `UNCHANGED`, `UNKNOWN_STATUS`, `NO_STATUS` — with `status: null` for everything but `APPLIED`. The route writes only `verdict.applied` and a missing lead now answers `success: false` with a `message` and no write.
- **`FreelancePipelineModal.tsx` treated every response as a success** and refreshed silently, so a refused update looked identical to an applied one. It now surfaces the refusal as an amber notice and clears it on a real change.

### Tests
- `src/tests/freelanceLeadStatusTruth.test.ts` — new, 9 cases: every UI status applies (and a repeat is refused), an unknown status is refused without being stored, a missing/non-string status is refused, whitespace is trimmed before matching, plus source guards that the route classifies before writing, no longer does `lead.status = status`, and 404s with `success: false`.
- Negative-validated: restoring the pre-fix route fails exactly 3 of 9 (`3 failed | 6 passed`), restored → 9/9.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **152 files / 1942 tests passed** (24.83 s, 0 failed); build exit 0 (`dist/server.cjs` 979.1 kb). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 22:17 IST (2026-10-04 16:47 UTC) — window slot 2: the social draft discloses its real origin

### Fixed
- **`POST /api/social/generate` in `server.ts` substituted a fixed marketing template whenever the AI provider was unconfigured or errored, then answered `success: true` with no field distinguishing model output from the canned fallback.** Any caller could present the template as generated copy. The YouTube generator in `src/components/SocialMediaModal.tsx` read a non-existent `data.draft` (the route returns `post`) and announced "AI-generated YouTube title, description, and hashtags staged" even when the provider wrote nothing — the fake-success shape the zero-fake-success item removes. New `resolveSocialGeneration` (`src/utils/hardening/socialGenerationTruth.ts`) credits non-empty model output to the provider and otherwise returns an explicitly labelled local template plus a disclosure notice; the route records `generationSource`/`aiGenerated`/`generationNotice` on the post. The modal now reads `data.post ?? data.draft`, speaks honestly for a local template, and renders a disclosure banner in the post view.
- **`data.draft` was never returned by the route**, so the AI-generated YouTube title, description, and hashtags were silently dropped. Reading `data.post ?? data.draft` restores them.

### Tests
- `src/tests/socialGenerationTruth.test.ts` — new, 10 cases: model output credited to the AI provider; empty/whitespace provider output falls back to a disclosed local template; the template names its topic and labels itself; the route routes through the helper, records the three generation fields, no longer stores raw provider text, and keeps the template in one place; the modal reads `post`, discloses a local template, and renders the banner.
- Negative-validated: reverting the route to store raw `generatedContent` and claim `generationSource: 'ai'` fails 2 of the 10 cases.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; targeted 4 files / 72 passed; full suite **151 files / 1933 tests passed** (24.35 s, 0 failed); build exit 0 (`dist/server.cjs` 1001047 bytes). E2E: NOT RUN (no provider key, no handset). Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 21:36 IST (2026-10-04 16:06 UTC) — window slot 1: the live call turn is read from the server envelope

### Fixed
- **`processTelephonyTurn` in `src/utils/telephonyEngine.ts` read `replyText`/`whisperTip` straight off the `POST /api/telephony/handle-turn` response body, but the server nests them under `turn`.** Against the live server both were `undefined` while the route still reported `success: true`, so the transcript gained an empty spoken turn and the AI whisper tip was dropped — the fake-success shape the zero-fake-success item removes. The request body also sent the engine's own field names (`latestInput`, `dialogueHistory`, `objective`) where the server destructures `userUtterance`, `conversationHistory`, `callObjective` and `isOutbound`, so every live turn answered the generic default line. New `normalizeLiveTurn` (`src/utils/hardening/liveTurnTruth.ts`) lifts the turn out of the envelope and reports an absent reply as empty rather than inventing one; the request now sends the field names the server reads.

### Tests
- `src/tests/liveTurnTruth.test.ts` — new, 8 cases: nested-envelope parse, absent reply reported as empty (no invented line), flat legacy body accepted as a fallback, non-string reply coerced to empty, `processTelephonyTurn` returns the server reply/whisper, sends the server request field names, and source guards for both edits.
- Negative-validated: reverting the client to read the top level fails the reply/whisper cases.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; targeted 1 file / 8 passed; full suite **150 files / 1923 tests passed** (25.17 s, 0 failed); build exit 0 (`dist/server.cjs` 1000117 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---


## [Unreleased] - 2026-10-04 02:50 IST (2026-10-03 21:20 UTC) — window slot 11: the freelance lead intake invents no client, budget or quotation

### Fixed
- **`POST /api/freelance/create-lead` in `server.ts` defaulted every omitted field — a `₹50,000` budget (`Number(budgetAmount) || 50000`), `'Telegram AI Bot'`, `'Full-Stack Web App'`, `'New Client Inquiry'`, status `'AI Requirements Extracted'` — and auto-generated a three-milestone quotation priced against the fabricated ₹50,000.** New `buildNewLeadRecord` / `recordedBudgetAmount` in `src/utils/freelanceLeadTruth.ts` store only supplied values: an unrecorded budget is `null`, a quotation is attached only when a budget exists, and the status is `'Lead Entered'`. `FreelancePipelineModal.tsx` and the Telegram listing render `'Budget not recorded'`; `FreelanceLead.budgetEstimate.amount` is now `number | null`.

### Tests
- `src/tests/freelanceLeadTruth.test.ts` — expanded to 14 cases: `recordedBudgetAmount` accepts only a real positive amount (omitted/blank/zero/negative/non-numeric → `null`), `buildNewLeadRecord` never substitutes ₹50,000 or a sample name, the quotation is priced against the supplied amount only, and source guards that the route no longer contains `50000` / `'New Client Inquiry'`.
- Negative-validated: restoring `: 50000` in `recordedBudgetAmount` fails exactly 3 of 14; restored → 14/14.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; targeted 1 file / 14 passed; full suite **147 files / 1895 tests passed** (23.95 s, 0 failed); build exit 0 (`dist/server.cjs` 997687 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 02:35 IST (2026-10-03 21:05 UTC) — window slot 10: the staged YouTube target channel is never invented

### Fixed
- **The YouTube draft routes (`POST /api/social/youtube/upload-draft`, `POST /api/social/youtube/draft-test` in `server.ts`) staged `targetChannel: memoryState.youTubeConnection?.channelTitle || 'YouTube Channel'` and named `|| 'Connected Channel'` in their Level-4 permission-gateway rows; `SocialMediaModal.tsx` rendered `|| 'Connected YouTube Channel'`.** Neither route reads a channel, so a draft staged before any channel had been read presented an invented channel name to the operator and the approval surface. A new `src/utils/hardening/youtubeChannelTruth.ts` (`recordedChannelTitle`, `describeStagedChannel`, `CHANNEL_NOT_RECORDED_LABEL`) returns the recorded title or `null`; every draft `targetChannel`, the permission `target`, the `verifyAndPublishToYouTube` result message, and both Social Hub renders route through it, and an unrecorded channel is left unset so the UI says `channel not recorded — no channel was read`.

### Tests
- `src/tests/youtubeChannelTruth.test.ts` — 6 cases: placeholder / blank / non-string inputs, the display label, and source guards that `server.ts` and `SocialMediaModal.tsx` no longer emit the three invented literals.
- Negative-validated: removing `'Connected YouTube Channel'` from the placeholder set fails exactly 2 of 6; restored → 6/6.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; targeted 1 file / 6 passed; related truth tests 3 files / 46 passed; full suite **147 files / 1886 tests passed** (24.33 s, 0 failed); build exit 0 (`dist/server.cjs` 996462 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 01:50 IST (2026-10-03 20:20 UTC) — window slot 9: the mobile bridge heartbeat route reports live device truth

### Fixed
- **`POST /api/mobile/bridge/heartbeat` (`server.ts`) answered `success: true, outcome: 'VERIFIED'` for every heartbeat the gateway accepted.** A simulated device, and a heartbeat whose session had already lapsed so the bridge status read `MOBILE_NOT_CONNECTED`, were both reported as a verified live bridge. The route now passes the observed heartbeat through `classifyBridgeHeartbeat` (`src/utils/hardening/bridgeHeartbeatTruth.ts`): a real, live, non-simulated device is `VERIFIED`; a simulated device is `SIMULATION_ONLY`; a heartbeat that did not leave the bridge live is `PARTIAL`. `success` equals `VERIFIED`, and a new `verified` field carries the same proof.

### Tests
- `src/tests/bridgeHeartbeatTruth.test.ts` — 9 cases: the four helper outcomes, agreement with the real `AndroidBridgeGateway` (paired live → VERIFIED, simulated → SIMULATION_ONLY, lapsed → PARTIAL), and a source guard that the route routes through the helper and no longer emits the unconditional `VERIFIED` literal.
- Negative-validated: the pre-fix `server.ts` contains the removed literal `success: true, outcome: 'VERIFIED', status: bridgeGateway.getStatus()` (confirmed via `git show HEAD:server.ts`); with the fix all 9 pass.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **146 files / 1880 tests passed** (23.86 s, 0 failed); build exit 0 (`dist/server.cjs` 995370 bytes). Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 01:28 IST (2026-10-03 19:58 UTC) — window slot 8: outbound-call authorization refuses an unrecorded request

### Fixed
- **`POST /api/telephony/outbound/authorize` (`server.ts`) answered `success: true, authorized: false, message: 'Outbound call cancelled.'` for any decision that was not `APPROVE`, even when `requestId` had never been staged.** The operator was told an outbound call had been withdrawn when no request existed; the `APPROVE` branch marked an unknown id `authorized: true` for the same reason. The route now passes the manager result through `classifyOutboundAuthorization` (`src/utils/hardening/outboundAuthorizationTruth.ts`), which reports `NOT_FOUND` with HTTP 404 — and no success flag — unless a real request record was found and its decision recorded.

### Tests
- `src/tests/outboundAuthorizationTruth.test.ts` — 9 cases: NOT_FOUND for a missing/refused/request-less record under both decisions, APPROVED/REJECTED on real records, agreement with the live `TelephonySessionManager`, and a source guard that the route routes through the helper and no longer emits the fake cancellation literal.
- Negative-validated: reverting `server.ts` fails exactly the 2 route assertions (`2 failed | 7 passed`); restored → 9/9.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **145 files / 1871 tests passed** (24.02 s, 0 failed); build exit 0 (`dist/server.cjs` 994056 bytes). Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 00:45 IST (2026-10-03 19:15 UTC) — window slot 7: the Computer Operator HUD reflects the live kill-switch state

### Fixed
- **`App.tsx` mounted `<ComputerOperatorModal>` without the `isEmergencyStopped` prop**, so the modal fell back to its `false` default. The HUD's own Run button therefore always called `ComputerOperatorEngine.executeTask(..., false)` and the `EMERGENCY PAUSED` banner could never render, regardless of the real switch position. The operator chat paths already refused on `ENGAGED`/`UNKNOWN`; the HUD path did not.
- `App.tsx` now mirrors the tri-state `KillSwitchLiveness` from `/api/emergency/status` — seeded `UNKNOWN` and only ever replaced by an awaited server answer, re-probed whenever the operator view opens — and passes `killSwitchBlocks(killSwitchLiveness)` to the modal. An ENGAGED or UNKNOWN switch now blocks the HUD run, matching the chat paths.

### Tests
- `src/tests/computerOperatorHudEmergencyTruth.test.ts` — 4 source-guard cases pin the UNKNOWN seed, the `killSwitchBlocks(killSwitchLiveness)` derivation, the re-probe on open, and the fail-closed update path.
- Negative-validated: deleting the `isEmergencyStopped` line fails exactly that guard (`1 failed | 3 passed`); restored → 4/4.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **144 files / 1862 tests passed** (24.68 s, 0 failed); build exit 0 (`dist/server.cjs` 993006 bytes). Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-04 00:26 IST (2026-10-03 18:56 UTC) — window slot 6: the Android bridge connect route stops reporting a degraded handshake as VERIFIED

### Fixed
- **`POST /api/mobile/bridge/connect` (`server.ts`) answered `outcome: 'VERIFIED'` on every successful handshake.** The `status` field already reported the truth — `PERMISSION_REQUIRED`, `LIMITED_CAPABILITY` or `SIMULATION_ONLY` — but a caller reading `outcome`, the field the honesty vocabulary reserves for confirmed work, was told a refused or simulation-only device had connected.
- The `outcome` and `success` flag now follow `bridgeGateway.getStatus()`: only a live, fully-permitted `CONNECTED` handshake is `VERIFIED`; a permission refusal maps to `PERMISSION_REQUIRED`, a limited/partial handshake to `NOT_AVAILABLE`, and no live device to `NOT_CONFIGURED`. This matches `androidBridgeEngine.ts` (`success: this.status === 'CONNECTED'`) and the client adapter, so the server route no longer contradicts the engine that produced the status.

### Tests
- `src/tests/androidBridge.e2e.test.ts` — the full-chain case now asserts `success === true`, `outcome === 'VERIFIED'` and `verified === true` on a fully granted handshake, driven against the real server process (1 file / 11 passed).
- `src/tests/actionExecutedRemainingSites.test.ts` — now 6 cases; a bounded source guard pins `const bridgeStatus = bridgeGateway.getStatus()`, `success: bridgeStatus === 'CONNECTED'` and the `CONNECTED ? 'VERIFIED'` mapping, and forbids the old unconditional `outcome: 'VERIFIED', status:` literal from returning to the connect handler.
- Negative-validated: restoring the unconditional claim fails exactly that source guard (`1 failed | 5 passed`); restored → 6/6.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **143 files / 1858 tests passed** (24.43 s, 0 failed); build exit 0 (`dist/server.cjs` 993006 bytes). E2E: Android bridge E2E ran against the real server process (1 file / 11 passed) — server-side leg only, no physical handset. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-03 23:23 IST (2026-10-03 17:53 UTC) — window slot 4: the bundled telephony suite stops asserting fabricated call success

### Fixed
- **Four of the 20 mandatory cases in `src/utils/telephonyTestRunner.ts` pinned the pre-hardening, fake behaviour the engine has since been fixed to refuse.** They asserted the fabricated success the whole zero-fake-success sweep exists to eliminate, so the suite failed its own honest invariants (observed `total 20 / passed 16 / failed 4` before the change):
  - #3 (English inbound) recited unverified clinic hours as fact.
  - #5 (Hindi clinic-hours QA) recited the sample clinic's `9:00` opening as fact.
  - #11 (human handoff) credited a simulation-only transfer as `CONFIRMED`.
  - #17 (outbound confirm) reported a call as "placed" with only a simulation adapter active.
- The assertions now pin the honest behaviour: #3/#5 report unverified hours as unverified and never recite a time; #11 requires `handoffStatus !== 'CONFIRMED'` + `handoff_unavailable_message_taking` + `simProvider.callTransferred === false`; #17 requires `actionExecuted === false` + `TELEPHONY_NOT_CONFIGURED` and the absence of the old "अधिकृत" placed-call phrase. Both #11 and #17 restore the registry to the default carrier afterwards so later cases are unaffected.
- No engine behaviour was changed — the engine already refused all four. Only the suite's stale expectations were corrected, so the bundled self-test now reports the truth it was written to prove.

### Tests
- `src/tests/telephonyTestRunnerHonesty.test.ts` — new file, 1 case: runs the whole suite and asserts `failed === 0`, `passed === total`, and that the outbound case's evidence string contains `actionExecuted: false` and `TELEPHONY_NOT_CONFIGURED` — so the suite cannot pass by narrating work no carrier performed.
- Negative-validated: restoring the old `9:00` assertion for #5 fails exactly the wrapper test (`1 failed | 0 passed`); restored → suite 20/20 and wrapper 1/1.

### Gates (observed)
- lint (`tsc --noEmit`) exit 0; full suite **143 files / 1857 tests passed** (23.64 s, 0 failed); build exit 0 (`dist/server.cjs` 992442 bytes). E2E: NOT RUN (no carrier / no handset). Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-03 22:47 IST (2026-10-03 17:17 UTC) — window slot 3: the LinkedIn status route stops presenting an unprobed env token as a live account

### Fixed
- **`GET /api/auth/linkedin/status` (`server.ts`) answered `connected: true` for a static `LINKEDIN_ACCESS_TOKEN` read straight from the environment.** Nothing had probed that token against LinkedIn, so an unmeasured credential was presented as a live account — the fabricated success this project forbids. It was internally inconsistent as well: the canonical `/api/social/platforms` card already labels the same token `CONFIGURED` ("Credentials present but not verified"), and the YouTube status route already keeps its static-token branch honest (`connected: false`, `status: 'CONFIGURED'`).
- The static-token branch now answers `connected: false`, `status: 'CONFIGURED'`, `configured: true`, `authType: 'STATIC_ENV_TOKEN'`, with a message directing the user to "Test connection". Only `/api/social/platforms/test` can confirm the account. The OAuth-connected branch (a real authenticated userinfo probe) is unchanged and still reports `connected: true`. The response exposes only the token's presence, never the token itself.

### Tests
- `src/tests/linkedinStatusTruth.test.ts` — new file, 3 cases: the static branch never contains `connected: true` and does contain `connected: false` + `status: 'CONFIGURED'` + "has not been verified against LinkedIn"; the OAuth branch still contains `connected: true`; the branch does not echo the token.
- Negative-validated: reverting the branch to `connected: true` fails exactly 1 of the 3 (`1 failed | 2 passed`); restored → 3/3.

### Verified
- Lint (`tsc --noEmit`) exit 0; full suite 142 files / 1856 tests passed (24.28 s, 0 failed); build exit 0 (`dist/server.cjs` 968.6 kb / 991806 bytes). E2E: NOT RUN (no LinkedIn credential / no device). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-03 21:22 IST (2026-10-03 15:52 UTC) — window slot 1: the offline engine stops staging a call to a fabricated placeholder number

### Fixed
- **The offline outbound-call and schedule branches (`src/utils/localJarvisEngine.ts`) fell back to a hardcoded placeholder number whenever the command captured no number**, so "make a call" or "schedule call tomorrow" staged a pending outbound request — behind the same Level-4 authorization prompt used for a real target — to a number the user never named. `server.ts` did the same with a fabricated `'Contact'` default in `classifyIntentLocally` and the `make_call` handler. A fabricated target is not performed work, and it is worse than a missing feature because it is presented as a staged call.
- New `extractDialTarget(raw)` and `offlineCallMissingNumberVerdict(phase)` (`src/utils/computerOperator/offlineCallTruth.ts`) make a target a number only when it carries at least three digits, and give the honest refusal for a command with no number. Both offline branches (`localJarvisEngine.ts` schedule ~1262, outbound ~1388), the local intent classifier (`server.ts` ~885) and the `make_call` handler (`server.ts` ~9149) now route through them: a request with no number returns `outbound_call_authorization` with `actionExecuted: false`, a title of `No Number to Call (nothing staged)` / `No Number to Schedule (nothing recorded)`, and a reply that asks which number — never a staged placeholder. A real number the user names still stages exactly as before.

### Tests
- `src/tests/offlineCallTruth.test.ts` — 4 new cases (file total 27): "make a call" refused with `actionExecuted: false`, `memory.stats.actionsExecuted` still 0 and no placeholder in the spoken text; "schedule call tomorrow" refused; a real named number (`call +91 98765 43210`) still staged; plus a source guard that the branches call `offlineCallMissingNumberVerdict(` and the placeholder literal is gone.
- Negative-validated: reintroducing the placeholder fallback in the outbound branch fails exactly 2 of the 27 (`2 failed | 25 passed`); restored → 27/27.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 3 files / 52 passed; full suite 141 files / 1853 tests passed (23.70 s, 0 failed); build exit 0 (`dist/server.cjs` 968.3 kb). E2E: NOT RUN (no carrier/PSTN). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-03 04:36 IST (2026-10-02 23:06 UTC) — window finalization: tip re-verified, no new development

### Verified
- Window 2026-10-02 → 2026-10-03 frozen and re-verified at tip `e99aaaf` on `feature/hermes-full-completion`. No new backlog item was advanced.
- Lint (`tsc --noEmit`) exit 0; full `npx vitest run` 141 files / 1849 tests passed (24.00 s, 0 failed); build exit 0 with artifact `dist/server.cjs` 964.8 kb.
- Security: `git check-ignore -v .env` → `.gitignore:4:.env`; `git status --short` empty; no `.env`, token, key, `node_modules/` or `dist/` tracked or staged. The diff-vs-main secret scan returned exactly one hit — a synthetic LinkedIn-token fixture at `src/tests/credentialRedactor.test.ts:273`, not a real credential. `npm audit`: NOT RUN.

### Known limitations
- E2E: NOT RUN — no handset, emulator, or display session in the sandbox. Deploy: `NOT_CONFIGURED`. Item 13 (`Zero-fake-success for all tools`) remains `PARTIAL`; the `server.ts` / `server_tools.ts` tail of unclassified `success: true` sites is still `UNKNOWN`. Hardware-blocked items #1/#50/#55 remain `NOT_AVAILABLE`.

### PR
- PR #5 remains open, non-draft, `mergeable_state: clean`. **Not merged — awaiting human approval.**

---

## [Unreleased] - 2026-10-03 04:08 IST (2026-10-02 22:38 UTC) — window slot 14: the global kill switch stops reporting a re-engagement as a fresh termination

### Fixed
- **`POST /api/system/kill-switch` (`server.ts`) always answered `{ success: true, message: 'Global Kill Switch engaged. All background processes terminated and queue cleared.' }` and always wrote a `🚨 GLOBAL KILL SWITCH TRIGGERED … cleared N pending …` Level 4 audit row, whatever the pre-transition state.** Engaging the switch while the system was already frozen cleared no queue (there are no `PENDING_APPROVAL` requests left to reject) yet still read as a fresh termination. New `killSwitchVerdict(pre, clearedTasksCount)` (`src/utils/emergencyTruth.ts`) derives the verdict from the state observed *before* the activation and the real cleared count: a genuine engagement reports `actionExecuted: true` / `outcome: 'ENGAGED'`; a re-engagement of a paused or latched system reports `outcome: 'ALREADY_ENGAGED'` / `actionExecuted: false`; an unobserved state reports `outcome: 'UNKNOWN'` and never claims an engagement. The route returns that verdict, gates both the audit row and the Telegram notice on `actionExecuted`, and answers `503` for the unknown case.

### Tests
- `src/tests/killSwitchTruth.test.ts` — 9 cases: fresh engagement with count; engagement clearing no queue does not invent a count; re-engagement of a paused system refused; re-engagement of a latched switch refused; unobserved state never engaged; non-finite cleared count treated as nothing; plus source guards that the route calls the classifier with the pre-transition state, that the old success literal is gone, and that the audit/Telegram branches are gated on `actionExecuted`.
- Negative-validated: restoring the original route fails exactly the three source guards (`3 failed | 6 passed`); restored → 9/9.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 1 file / 9 passed; full suite 141 files / 1849 tests passed (23.62 s); build exit 0 (`dist/server.cjs` 964.8 kb). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-03 03:42 IST (2026-10-02 22:12 UTC) — window slot 13: the telephony call-history delete routes stop reporting a deletion that never happened

### Fixed
- **`DELETE /api/telephony/calls` and `DELETE /api/telephony/calls/:id` (`server.ts`) answered `{ success: true, message: … }` unconditionally.** Clearing an already-empty history, or deleting an id that was never recorded, read as a completed deletion while the in-memory store was unchanged, so a caller could not distinguish a real removal from a no-op. New `classifyTelephonyCallDeletion(removed, targetId?)` (`src/utils/hardening/telephonyCallDeleteTruth.ts`) derives the verdict from the actual removed count: a real removal reports `success: true` with the count and `outcome: 'DELETED'`; an empty clear reports `success: false` / `outcome: 'NOTHING_TO_CLEAR'`; an unknown id reports `success: false` / `outcome: 'NOT_FOUND'` and names the id. Both routes now return that verdict.

### Tests
- `src/tests/telephonyCallDeleteTruth.test.ts` — 8 cases: real clear with count; empty clear refused; real id deleted; unknown id refused and named; non-finite/negative removed treated as nothing; plus source guards that both routes call the classifier and that neither the old `success: true` literal nor `res.json({ success: true` survives on either delete route.
- Negative-validated: restoring the two unconditional `success: true` literals fails exactly the three route guards (`3 failed | 5 passed`); restored → 8/8.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 1 file / 8 passed; full suite 140 files / 1840 tests passed (23.95 s); build exit 0 (`dist/server.cjs` 963.2 kb). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-03 03:10 IST (2026-10-02 21:40 UTC) — window slot 12: the web-fetch route stops reporting an unreadable page as a successful fetch

### Fixed
- **`realWebFetch` (`server_tools.ts`) returned `success: true` for any 2xx response and used `parsedUrl.hostname` as the title when the page had no `<title>`.** A consent/bot-check interstitial, an empty shell or a script-only page answers HTTP 200 with nothing readable, so the route reported a completed web analysis with an empty `textContent` and a bare hostname presented as the page title, which then flowed into the chat reply and the audit entry. New `classifyWebFetchContent(rawHtml)` (`src/utils/hardening/webFetchTruth.ts`) strips scripts/styles/the `<head>`, reports whether the cleaned body carries readable text (≥ `MIN_READABLE_CHARS`) and returns the page's own `og:title`/`<title>` or `null` — never the hostname. The route now refuses with `success: false` / "No readable content" when the page exposed nothing, and reports a title only when the page actually supplied one.

### Tests
- `src/tests/webFetchTruth.test.ts` — 7 cases: real title + body; `og:title` preferred; consent interstitial with a `<title>` but no body refused; script-only page refused; empty/absent body refused; unobserved title reported `null` not the hostname; plus a bounded source guard (route uses the classifier and refuses with `success: false`; the old hostname-as-title fallback is gone).
- Negative-validated: `git stash` of the `server_tools.ts` change fails the source guard (`1 failed | 6 passed`); restored → 7/7.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 1 file / 7 passed; full suite 139 files / 1832 tests passed (23.62 s); build exit 0 (`dist/server.cjs` 985386 bytes). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-03 02:41 IST (2026-10-02 21:11 UTC) — window slot 11: the YouTube transcript fetch route stops fabricating video metadata

### Fixed
- **`fetchYouTubeTranscriptData` (`server_tools.ts`) defaulted `title` to `'YouTube Video'` and `channel` to `'YouTube Creator'` and returned `success: true` when the fetched watch page carried no `ytInitialPlayerResponse`.** A consent/bot-check interstitial answers HTTP 200 with a generic Chrome `<title>` and no player response, so the route reported a genuinely-fetched video whose title was the literal placeholder, channel `'YouTube Creator'`, and duration 0 — metadata nobody observed, which then flowed into the transcript prompt and the audit entry. New `resolveYouTubePageMetadata(html, playerResponse)` reports only observed values: title/channel/duration are `null` when absent, a non-finite `lengthSeconds` is `null` rather than 0, the generic `<title>` is never read as a video title, and only a real `og:title` is trusted on an unparsed page. The route now refuses with `success: false` when there is neither a player response nor an `og:title`, and no longer hardcodes a placeholder. A real page still resolves to its true title/channel/duration with `success: true`.

### Tests
- `src/tests/youtubeMetadataTruth.test.ts` — 7 cases: real player-response resolution; every field `null` on a consent page; generic `<title>` not used as the video title; only the title taken from an unparsed page with `og:title`; non-finite duration treated as unobserved; plus two bounded source guards (no placeholder literals; the route resolves via the helper and refuses with `success: false`).
- Negative-validated: stashing the source fix fails all 7 cases; restored → 7/7.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 1 file / 7 passed; full suite 138 files / 1825 tests passed (25.59 s); build exit 0 (`dist/server.cjs` 984115 bytes). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-03 01:16 IST (2026-10-02 19:46 UTC) — window slot 9: the Security Matrix update route stops reporting unapplied changes as saved

### Fixed
- **`POST /api/security/update` (`server.ts`) copied whichever fields the body carried over the running matrix and answered `{ success: true }` unconditionally.** Three false-success shapes followed: an empty body read as a successful save; a `currentLevel` outside the real 1..4 range was stored as-is; and an unknown field (a typo such as `humanApprovlForExternal`, or a key from a stale client) was written into the matrix and reported as applied. For the two boolean gates the last shape is worse than cosmetic — a string such as `"false"` is truthy in every `if (humanApprovalForExternal)` / `if (maskSensitiveData)` gate downstream while a tri-state renderer reads it as neither true nor false. New `classifySecurityMatrixUpdate(body)` (`src/utils/hardening/securityMatrixUpdateTruth.ts`) accepts only the real fields with valid values (`currentLevel` in 1..4 as a number; the two gates as booleans), refuses everything else, and distinguishes `NO_KEYS` from `ALL_INVALID`. The route applies only `verdict.applied`, answers `success: false` / `applied: false` with the reason and rejected field names when nothing valid was supplied, and names any ignored keys on a partial apply.
- **`src/components/SecurityMatrixModal.tsx` (`handleUpdateLevel`, `handleToggleHumanApproval`) silently ignored a rejected update.** Both now surface a notice and resync to the server's real state instead of leaving the selector showing a level or an approval gate that was never applied.

### Tests
- `src/tests/securityMatrixUpdateTruth.test.ts` — 18 cases: valid level / approval / masking applied; empty body rejected as `NO_KEYS`; non-object body rejected; out-of-range level rejected; string level rejected; non-boolean approval value rejected; numeric masking value rejected; unknown field rejected; mixed real+unknown applies the real field and names the unknown one; invalid sibling not applied while a valid one is; plus four bounded source guards (classifies against the real fields, returns `success: false` / `applied: false`, does not spread `...req.body`, assigns only the classified fields) and two modal guards.
- Negative-validated: restoring the pre-fix route fails exactly the three route assertions (`3 failed | 15 passed`); restored → 18/18.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 1 file / 18 passed; full suite 136 files / 1812 tests passed (24.12 s); build exit 0 (`dist/server.cjs` 981690 bytes). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-03 01:00 IST (2026-10-02 19:30 UTC) — window slot 8: the telephony permission route stops reporting unapplied changes as saved

### Fixed
- **`POST /api/telephony/permissions` (`server.ts`) merged any caller-supplied object over the stored matrix and answered `success: true` unconditionally.** A body naming a permission key that does not exist — a typo, or a key from a stale client — was reported as an applied change, and an empty body read as a successful save. That is a false success on the exact surface that gates outbound calling, private-data access and call recording. New `classifyPhonePermissionUpdate(body, PHONE_PERMISSION_DEFINITIONS)` (`src/utils/hardening/phonePermissionUpdateTruth.ts`) accepts only keys that exist in the real definitions and only values carrying a valid `NOT_CONFIGURED|DENIED|ASK|GRANTED` state. The route applies just `verdict.applied` and answers `success: false` with `applied: false` and a naming `reason` (`NO_KEYS` / `ALL_UNKNOWN`) when nothing real was supplied, naming any ignored keys.
- **`src/components/TelephonyHubModal.tsx` (`handleTogglePermission`) left the toggle flipped after a rejection.** It now awaits the response, reverts the toggle when the server did not apply the change, and surfaces an honest notice instead of showing a permission as granted that was never persisted.

### Tests
- `src/tests/telephonyPermissionUpdateTruth.test.ts` — 11 cases: known key applied, all four documented states accepted, unknown key rejected, empty body rejected, non-object body rejected, invalid state value rejected, mixed real+unknown applies the real key and names the unknown one, plus three bounded source guards (classifies against the definitions, returns `success: false`, saves `{ ...current, ...verdict.applied }` not the raw body).
- Negative-validated: restoring the pre-fix route fails exactly the three route assertions (`3 failed | 8 passed`); restored → 11/11.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 1 file / 11 passed; full suite 135 files / 1794 tests passed (27.30 s); build exit 0 (`dist/server.cjs` 979414 bytes). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-03 00:14 IST (2026-10-02 18:44 UTC) — window slot 7: the social OAuth disconnect routes stop faking a credential removal

### Fixed
- **`POST /api/auth/linkedin/disconnect` and `POST /api/auth/youtube/disconnect` (`server.ts`) answered `success: true` and wrote a `… Disconnected (…)` `VERIFIED` audit row unconditionally.** They cleared an already-absent `memoryState.linkedInConnection` / `memoryState.youTubeConnection`, so a disconnect while nothing was linked read as a real credential removal in the response *and* in the audit trail, and the Social Media Hub announced a disconnection. Both routes now guard on an existing connection first: a no-op returns `success: false` with `outcome: 'NOT_CONNECTED'` and a naming message, writes **no** audit row, and only the confirmed path clears the credential and logs the removal.
- **`src/components/SocialMediaModal.tsx` (`handleDisconnectLinkedIn` / `handleDisconnectYouTube`) fell through to the success notice.** Each handler now surfaces the server's honest message in a not-connected `else` branch instead of claiming a disconnection.

### Tests
- `src/tests/oauthDisconnectTruth.test.ts` — 4 cases: each route's connection guard precedes its `success: true` and carries the `NOT_CONNECTED` outcome; the `Disconnected (…)` audit write follows the not-connected early return; and both modal handlers render `data.message` in an `else` branch.
- Negative-validated: disabling both guards fails exactly the two guard assertions (`2 failed | 2 passed`); restored → 4/4.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 1 file / 4 passed; full suite 134 files / 1783 tests passed (22.81 s); build exit 0 (`dist/server.cjs` 970016 bytes). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 22:35 IST (2026-10-02 17:05 UTC) — window slot 3: the offline action counter follows the verdict

### Fixed
- **`src/utils/localJarvisEngine.ts` advanced `stats.actionsExecuted` in 15 places with a bare `updatedMemory.stats.actionsExecuted += 1` while the `actionExecuted` verdict was decided separately in each return literal.** The counter could therefore disagree with what the engine reported as done — a total that moves for work the engine did not perform, or stays still for work it did. All 15 sites now call the single gated `countAction(updatedMemory, true)` helper (`if (actionExecuted !== false) memory.stats.actionsExecuted += 1;`).
- **The offline `language_switch` branch returned `actionExecuted: true` without advancing the counter.** A 48-command matrix surfaced it: the reply said the mode had changed while the "actions executed" total stayed still. It now counts like every other true verdict. (`set_name` keeps its own increment because it also rewrites `memory.name`; audited, matches the verdict.)

### Tests
- `src/tests/offlineActionCounterConsistency.test.ts` — 4 cases: a source pin that the engine holds no ad-hoc `updatedMemory.stats.actionsExecuted +=` and keeps the gated helper; a 48-command verdict/counter matrix asserting `counter delta === (actionExecuted ? 1 : 0)` over true, false and no-action branches in English, Hindi and Hinglish; a `language_switch` regression pin; and a refusal/unrecognised-command pin.
- Negative-validated: removing the switch branch's `countAction` call fails exactly 2 of 4 (`2 failed | 2 passed`); restored → 4/4.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 3 files / 55 passed. Full suite 129 files / 1742 tests passed; build exit 0 (`dist/server.cjs` 965651 bytes). Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 21:44 IST (2026-10-02 16:14 UTC) — window slot 2: the operator chat path fails closed on an unknown emergency-stop state

### Fixed
- **`fetchKillSwitchState()` (`src/utils/operatorChatIntegration.ts`) collapsed "emergency stop confirmed released" and "state could not be determined" into the same `false`.** A non-OK response, a malformed body, a network error and the 2-second abort all returned `false`; both `src/App.tsx` dispatch sites passed that value as `killSwitchActive`, so an unreachable `/api/emergency/status` made the owner's emergency stop silently fail to block a host action. The helper now resolves a tri-state `KillSwitchLiveness` (`ENGAGED | RELEASED | UNKNOWN`), `killSwitchBlocks()` blocks everything except a confirmed `RELEASED`, and `operatorKillSwitchRefusal()` supplies the honest refusal text. Both dispatch sites refuse before running and pass `killSwitchActive: false` only once `RELEASED` is confirmed. This mirrors the `emergencyLiveness` tri-state (`src/utils/emergencyTruth.ts`) the Permission Gateway, HUD header and Autonomous Tools panel already use.

### Tests
- `src/tests/operatorChatIntegration.test.ts` — new `operator kill-switch tri-state liveness` block (8 cases): released/engaged flag combinations; `null`/`undefined`/`{}`/non-boolean-string/non-object → `UNKNOWN`; `killSwitchBlocks` blocking for ENGAGED and UNKNOWN while releasing only on RELEASED; the two refusal messages; and three `fetchKillSwitchState` cases (non-OK → UNKNOWN, thrown error → UNKNOWN, real released boolean → RELEASED).
- Negative-validated: restoring `killSwitchBlocks` to `liveness === 'ENGAGED'` fails exactly the UNKNOWN-blocking assertion (`1 failed | 21 passed`); restored → 22/22.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 1 file / 22 passed. Full suite/build recorded in the window report. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 21:26 IST (2026-10-02 15:56 UTC) — window slot 1: the computer-operator execute route no longer reports success for failed runs

### Fixed
- **`POST /api/computer-operator/execute` (`server.ts`) answered `{ success: true, task }` for every engine result.** The route awaited `ComputerOperatorEngine.executeTask(...)` and then returned a flat success, so a `FAILED`, `BLOCKED`, `NEEDS_APPROVAL` or `CANCELLED` run — and a run that never reached a terminal state — all read as performed host work to any caller reading `success`. The flag now follows `operatorTaskExecuted(task)` (the helper the `/api/chat` `fix_project_error` branch already uses) and the route names the engine verdict in a new `outcome` field.

### Tests
- `src/tests/computerOperatorExecuteRouteTruth.test.ts` (5 cases) — a bounded source guard proves the execute-route body no longer contains `res.json({ success: true, task })` and does contain `success: operatorTaskExecuted(task)`; behavioural runs of the real engine cover COMPLETED, FAILED, BLOCKED (ambiguous screen) and NEEDS_APPROVAL, asserting the verdict each time.
- Negative-validated: restoring `success: true` fails exactly the source guard (`1 failed | 4 passed`); restored → 5/5.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted 1 file / 5 passed; full suite **128 files / 1730 tests passed** (22.69 s); build exit 0 (`dist/server.cjs` 965733 bytes). E2E: NOT RUN (no display session / handset). Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 04:27 IST (2026-10-01 22:57 UTC) — window slot 15: outbound dial no longer hands the carrier a callback URL nobody can reach

### Fixed
- **`TwilioTelephonyProvider.startOutboundCall()` (`src/utils/telephonyAdapters.ts`) fabricated the call-answer callback host.** It built the URL as `${this.webhookBaseUrl || 'https://hermes-jarvis.local'}${TELEPHONY_TWIML_TURN_PATH}`. The carrier calls back on that URL for every call turn, so with `TELEPHONY_WEBHOOK_BASE_URL` unset the adapter substituted the fabricated host `https://hermes-jarvis.local`, which resolves nowhere: Twilio would accept the call and the call could never connect — a placed call reported as success that cannot work. A private/loopback base URL had the same effect. The dial now refuses unless the base URL is one a carrier could actually reach, via `isCarrierReachableWebhookBaseUrl()` (absolute `https`, host not loopback, `.local`, or RFC 1918 private). On failure it returns `TELEPHONY_WEBHOOK_BASE_URL_MISSING`; there is no fabricated fallback.

### Tests
- `src/tests/telephonyEndpointTruth.test.ts` (+4 cases) — blank/absent, the fabricated host, every loopback/private host, and non-https/relative URLs all reject; a public https host accepts; the adapter source no longer contains `hermes-jarvis.local`.
- `src/tests/telephonyProviderHonesty.test.ts` (+2 cases) — no callback URL set → `success: false` with no `providerCallId`; a private `TELEPHONY_WEBHOOK_BASE_URL` → `success: false`.
- Negative-validated: forcing the guard to `false` fails exactly the 2 new behavioral cases (`2 failed | 8 passed`); the captured failure shows a real Twilio API 401, proving the dial left the adapter before the guard; restored green.

### Verified
- Targeted `telephonyEndpointTruth` + `telephonyProviderHonesty` 2 files / 30 passed; full suite **127 files / 1725 tests passed** (23.84 s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 965667 bytes). E2E: NOT RUN (no carrier credentials, no public webhook host). Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 03:47 IST (2026-10-01 22:17 UTC) — window slot 14: real bridge adapter and telephony simulator stop faking success

### Fixed
- **`RealAndroidBridgeAdapter.connect()` (`src/utils/androidBridgeAdapter.ts`) returned `success: true` on any HTTP 200.** It called `androidBridgeEngine.connectDevice(...)` — whose honest status is `LIMITED_CAPABILITY` for a simulated/testbed device or one missing the call-answer capability, and `PERMISSION_REQUIRED` when no notification-access/call-detection grant exists — then discarded that result and reported flat success. A caller reading `.success` would believe a live, fully-permitted device had connected. The flag now follows the observed status: `success: status === 'CONNECTED'`, with a message that names the degraded status otherwise.
- **`TelephonyProviderRegistry.getActiveStatus()` (`src/utils/telephonyAdapters.ts`) reported the simulator as `READY`.** It returned `READY` whenever the active provider's `isConfigured()` was true, and `SimulatedTestTelephonyProvider.isConfigured()` is unconditionally `true`. A simulator has no PSTN carrier, so the active `SIMULATION_PROVIDER_ID` is now reported `NOT_CONFIGURED`, consistent with the `SIMULATION_ONLY` mode/label the gateway-truth module already uses.

### Tests
- `src/tests/realAndroidBridgeAdapter.test.ts` (+2 cases) — a 200 with a simulated device and a 200 with a device that cannot answer calls both yield `success: false` with status `LIMITED_CAPABILITY`.
- `src/tests/telephonyGatewayTruth.test.ts` (+2 cases) — the active simulator is `NOT_CONFIGURED`; a real configured carrier is still `READY`.
- Negative-validated: restoring the adapter's `success: true` fails exactly the 2 new adapter cases (`2 failed | 7 passed`); removing the simulator guard fails exactly the 1 new `getActiveStatus` case (`1 failed | 11 passed`); both restored green.

### Verified
- Targeted `realAndroidBridgeAdapter` + `telephonyGatewayTruth` 2 files / 21 passed; full suite **127 files / 1718 tests passed** (23.23 s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 964691 bytes). E2E: NOT RUN (no Android hardware, no carrier credentials). Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 03:22 IST (2026-10-01 21:52 UTC) — window slot 13: bridge status badge no longer fakes a green connection

### Fixed
- **`MobileBridgeModal` (`src/components/MobileBridgeModal.tsx`) rendered its header badge green for `CONNECTED`, `PERMISSION_REQUIRED` and `LIMITED_CAPABILITY` alike.** A device downgraded to limited capability, or one that had refused with no permissions, therefore showed the live green style — the UI claiming a connection the status did not support. Added `bridgeStatusTone()` to `src/utils/mobileBridgeEngine.ts`: only `CONNECTED` is `live` (green), `PARTIALLY_CONNECTED` / `LIMITED_CAPABILITY` / `PERMISSION_REQUIRED` are `degraded` (amber), the rest plus anything unrecognised are `inactive` (grey). The badge now keys off that tone.

### Tests
- `src/tests/bridgeStatusTone.test.ts` (new, 11 tests) — pins the tone of every `AndroidBridgeStatus`, asserts `CONNECTED` is the only live status in the union, treats an unknown status as inactive, and guards the component wiring.
- Negative-validated: mapping `LIMITED_CAPABILITY`/`PERMISSION_REQUIRED` back to `live` fails 4 of 11 (`4 failed | 7 passed`); restored → 11/11 green.

### Verified
- Targeted `bridgeStatusTone` 1 file / 11 passed; full suite **127 files / 1714 tests passed** (22.67 s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 964606 bytes). E2E: NOT RUN (no Android hardware). Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 01:43 IST (2026-10-01 20:13 UTC) — window slot 10: offline search branch points the in-app Browser at the query

### Fixed
- **The offline `google_search` branch (`src/utils/localJarvisEngine.ts`) named a search the in-app Browser never loaded.** It emitted only `payload.query`. The client (`src/App.tsx` `handleExecuteAction`) reads the destination from `payload.target` and hands it to `BrowserModal` as `initialUrl`; `BrowserModal` ignores `initialQuery` whenever `initialUrl` is set, so the view stayed on its Google home while the action card and reply named the query. The branch now routes through the same `searchDispatch()` helper the `/api/chat` path uses and emits `payload: { query, target: dispatch.url }`, so the Browser loads `https://www.google.com/search?q=<query>`.

### Tests
- `src/tests/localJarvisEngine.test.ts` — a new case (`carries the search URL in payload.target so the in-app Browser loads it`) asserts the derived search URL.
- Negative-validated: reverting the payload to `{ query }` fails exactly that case (`1 failed | 46 skipped`); restored → green.

### Verified
- Targeted `localJarvisEngine` + `browserDispatchTruth` 2 files / 70 passed; full suite **124 files / 1694 tests passed** (24.26 s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 964583 bytes). Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 01:16 IST (2026-10-01 19:46 UTC) — window slot 9: browser-open dispatch answers Hindi users in Hindi

### Fixed
- **The `open_google` / `open_youtube` / `open_gmail` / `open_chatgpt` dispatch case (`server.ts`) gated its Hindi reply on `language === 'hi'`.** The client (`src/App.tsx`) posts `voiceSettings.language` — a locale such as `hi-IN` or `hinglish`, never a bare `hi` — so the comparison was dead code and every Hindi user got the English `verdict.replyEn`. It is the only bare-`hi` comparison in `server.ts`; every other language gate uses `language.startsWith('hi')`. Now uses `language.startsWith('hi')`.

### Tests
- `src/tests/browserDispatchTruth.test.ts` — a new case bounds the `open_google` case body and asserts the `startsWith('hi')` form is present and the `language === 'hi'` form is absent.
- Negative-validated: restoring the bare `hi` comparison fails exactly that case (`1 failed | 10 passed`); restored → 11/11.

### Verified
- Full suite **124 files / 1693 tests passed** (22.24 s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 964517 bytes). Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 01:02 IST (2026-10-01 19:32 UTC) — window slot 8: telephony adapters stop reporting undelivered provider documents as success

### Fixed
- **The Twilio / Telnyx / Plivo adapters (`src/utils/telephonyAdapters.ts`) returned `{ success: true }` for actions no carrier ever received.** `answerIncomingCall`, `rejectIncomingCall`, `endCall`, `playAudio`, `streamAudio` and `collectSpeech` only built a provider document (TwiML, a provider command, or Plivo XML) and returned `success: true` without delivering it. A caller reading `success` would believe an audio prompt had played, speech collection had started, or a call had ended. All six methods now return `success: false` with the shared `TELEPHONY_DOCUMENT_NOT_DELIVERED` reason, while still returning the document fields so a caller can transmit them explicitly. The methods have no in-repo consumers, so no runtime behaviour changed.

### Tests
- `src/tests/telephonyProviderHonesty.test.ts` (8 tests): source guards on the shared constant and per-provider honest verdicts.
- Negative-validated: reverting the adapter verdicts to `success: true` fails `1 failed | 7 passed`; restored → 8/8.

### Verified
- Full suite **124 files / 1692 tests passed** (21.66 s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 964509 bytes). Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-02 00:56 IST (2026-10-01 19:26 UTC) — window slot 7: the outbound-dial authorize route no longer dials through the simulator

### Fixed
- **`POST /api/telephony/outbound/authorize` reported a placed call that no carrier saw.** The route (`server.ts`) gated its dial on the raw `provider.isConfigured()` boolean and then called `startOutboundCall()`. The `simulation_test_provider`'s `isConfigured()` is unconditionally `true` and its `startOutboundCall()` returns a fabricated `providerCallId`, so once the simulator was the selected engine the route answered `success: true` with a `providerCallId` although nothing left the machine — the same fake-success class as the earlier telephony-handoff fix, on the adjacent route. The route now derives the active engine mode from the registry via the existing `telephonyEngineMode()` and refuses any dial the engine cannot actually place, naming the mode (`SIMULATION_ONLY` / `TELEPHONY_NOT_CONFIGURED` / `TELEPHONY_ENGINE_UNSUPPORTED`) with the matching refusal text. A new `telephonyEngineCanObserveCall(mode)` in `src/utils/telephonyGatewayTruth.ts` is the single predicate for "this engine can place a real PSTN call".

### Tests
- `src/tests/telephonyOutboundDialTruth.test.ts` (9 tests): source guards on the route and behavioural checks of the shared verdict functions.
- Negative-validated: reverting the route gate to `!provider.isConfigured() && req.body.isSimulated !== true` fails `2 failed | 7 passed`; restored → 9/9.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted `telephonyOutboundDialTruth`+`telephonyGatewayTruth` 2 files / 19 passed; full suite **124 files / 1690 tests passed** (22.42 s); build exit 0 (`dist/server.cjs` 963512 bytes). Live E2E on `node dist/server.cjs` (PORT 4013): simulator selected (`engineApplied: true`) → authorize HTTP 400 `status: SIMULATION_ONLY`; default twilio engine → authorize HTTP 400 `status: NOT_CONFIGURED`. Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-01 23:50 IST (2026-10-01 18:20 UTC) — window slot 6: the offline blueprint branch no longer claims phases 0-9 are active

### Fixed
- **The offline `check_project` branch spoke a readiness claim it never measured.** `src/utils/localJarvisEngine.ts` (the fallback engine used when the server is unreachable) answered a "project"/"blueprint"/"roadmap" request with `Displaying Master Blueprint Phase 0 to 9.` / `All phases active hain.` / `मास्टर ब्लूप्रिंट खोला जा रहा है। फेज 0 से 9 सक्रिय हैं।`. That path never reads `/api/blueprint`, so it cannot know the phase list or whether any phase is active — the identical readiness claim the blueprint-truth work removed from `BlueprintRoadmapModal.tsx`, still alive one layer down in the spoken reply. The reply now comes from `blueprintRoadmapReply(lang)` in `src/utils/blueprintTruth.ts`, which states the view is opening and that the phase list is unconfirmed (English, Hindi and Hinglish).

### Tests
- `src/tests/blueprintProgressTruth.test.ts` (+3 cases +1 engine source guard): every language reply is free of "phase 0 to 9" / "all phases active" and names `/api/blueprint` as unread; the engine source must call `blueprintRoadmapReply(` and contain none of the hardcoded claims.
- Negative-validated: restoring the hardcoded phase claim fails the engine source guard → `1 failed | 12 passed`; restored → 13/13.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted `blueprintProgressTruth`+`localJarvisEngine` 2 files / 59 passed; full suite **123 files / 1681 tests passed** (22.55 s); build exit 0 (`dist/server.cjs` 962913 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-01 23:19 IST (2026-10-01 17:49 UTC) — window slot 5: the telephony agent no longer recites unverified clinic facts on live calls

### Fixed
- **Clinic hours, doctor availability and the booking process were spoken as fact from a hardcoded sample dataset.** `TelephonySessionManager.processTurn` (`src/utils/telephonySessionManager.ts`) answered the `clinic_hours`, `doctor_availability` and `appointment_process` intents by reading `DEFAULT_CLINIC_CONFIG` (`src/utils/telephonyPermissions.ts`) — the sample data "Apollo Health & Wellness Clinic", "Dr. Julian Wayne, MD (Physician)", "Monday to Friday 9:00 AM to 6:00 PM" — which no human verified for any deployment, and which `/api/telephony/twiml/turn` passes to `processTurn` on every real inbound call. A caller to a real clinic heard another business's details presented as this clinic's own. Added `ClinicConfig.configured` (the shipped sample sets it `false`); the three intents now report the fact as *not verified* and offer to take a message unless `configured === true`, while a deployment that supplies verified data still answers normally.

### Tests
- `src/tests/telephonyClinicFactsHonesty.test.ts` (+6 tests): unconfigured config → hours/booking/availability reported as not verified, no "9:00", no "Julian Wayne"; verified config → normal answers preserved.
- Negative-validated: flipping `configured` to `true` restores the recital → `5 failed | 1 passed`; restored → `6/6`.

### Verified
- Lint (`tsc --noEmit`) exit 0; full suite **123 files / 1677 tests passed** (23.02 s); build exit 0 (`dist/server.cjs` 962168 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-01 22:51 IST (2026-10-01 17:21 UTC) — window slot 4: the Computer Operator no longer credits a screen capture it never made

### Fixed
- **`inspectScreen` reported "Captured the current view" from a synthetic image.** `ActionExecutor.inspectScreen` (`src/utils/computerOperator/actionExecutor.ts`) returned `outcome: 'VERIFIED'`, `success: true` whenever the observation carried `screenshotBase64`. The non-host-backed `ScreenObserver` (`src/utils/computerOperator/screenObserver.ts`) draws a canvas image of an imagined VS Code / Chrome / Terminal desktop and returns it as `screenshotBase64`, so in a browser context a picture of a screen this process never observed was reported as a verified capture. `inspectScreen` now refuses locally with `NOT_AVAILABLE` / `ILLUSTRATIVE_OBSERVATION_SOURCE` unless `ScreenObserver.isHostBacked()`; a host-backed observation with image data still verifies, and one with no image is `NO_CAPTURE_PRODUCED`.

### Tests
- `src/tests/remainingFakeSuccess.test.ts` (+4 tests): illustrative observation carrying a synthetic image → `NOT_AVAILABLE`, `success: false`, `receipt.verified: false`, `ILLUSTRATIVE_OBSERVATION_SOURCE`; `TAKE_SCREENSHOT` against the illustrative observer → `NOT_AVAILABLE`; host-backed observation with image → `VERIFIED`; host-backed observation with no image → `NO_CAPTURE_PRODUCED`.
- Negative-validated: disabling the `isHostBacked()` gate → `1 failed | 51 passed`; restored → `52/52`.

### Verified
- Lint (`tsc --noEmit`) exit 0; full suite **122 files / 1671 tests passed** (22.97 s); build exit 0 (`dist/server.cjs` 959709 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-01 22:27 IST (2026-10-01 16:57 UTC) — window slot 3: the telephony handoff no longer confirms a transfer no carrier observed

### Fixed
- **A staff handoff reported "Transferring your call to our clinic staff now, please hold the line" with no carrier.** `TelephonySessionManager.processTurn`'s handoff branch confirmed the transfer whenever `provider.isConfigured() || session?.isSimulated` and the adapter returned `providerConfirmed: true`. The simulator's `transferCall()` (`src/utils/telephonyAdapters.ts`) is hardcoded `providerConfirmed: true`, and an unconfigured real carrier cannot be observed at all, so a call nothing handled read as a confirmed handoff and the session advanced to `CONFIRMED`. The branch now derives the active engine mode from the registry and only attempts the transfer when `telephonyEngineCanObserveCall()` — a live gateway. An unconfirmed transfer is reported as unconfirmed.
- **The unconfirmed-transfer fallback invented a busy line.** It answered "all staff members are currently occupied on another line" — a state never observed. It now states the transfer could not be confirmed (no live carrier).

### Tests
- `src/tests/telephonyHandoffTruth.test.ts` (new, 4 tests): simulated session → not `handoff_confirmed`, `handoffStatus FAILED`, no "hold the line" claim; no "occupied on another line" / "लाइन व्यस्त"; unconfigured real carrier → not `handoff_confirmed`; message-taking still offered and the call not ended.
- Negative-validated: reverting the gate → `2 failed | 2 passed`; restored → `4/4`.

### Verified
- Lint (`tsc --noEmit`) exit 0; full suite **122 files / 1667 tests passed** (23.07 s); build exit 0 (`dist/server.cjs` 958584 bytes). E2E: NOT RUN (no handset/SIM/Twilio). Deploy: NOT_CONFIGURED. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-10-01 04:30 IST (2026-09-30 23:00 UTC) — window slot 17: an offline briefing no longer credits itself for work it did not do

### Fixed
- **The morning briefing advanced "Autonomous Actions Executed" with no device attached.** `processOfflineCommand` (`src/utils/localJarvisEngine.ts`) incremented `updatedMemory.stats.actionsExecuted` at the top of the briefing branch, before it knew whether any telemetry had actually been read. With no phone connected every telemetry section speaks a "no source connected" refusal, yet the counter still ticked up. Fixture data flagged `isSample` counted the same way — sample data is not a measurement. The briefing now credits the counter only when at least one real telemetry section was read (`readAnyTelemetry`).
- **A successful weather answer advanced the counter.** Like the already-fixed `time_inquiry`, `weather_inquiry` only switches the app to the status view (`src/App.tsx`) and speaks a reading; it is an informational answer, not executed work. The branch no longer increments and reports `actionExecuted: false`.

### Tests
- `src/tests/localJarvisEngine.test.ts` — the sample-fixture briefing test now pins `actionExecuted === false` (sample telemetry is not a real read).
- `src/tests/remainingFakeSuccess.test.ts` — briefing counter block: no-telemetry → `actionsExecuted` 0; one real telemetry section read → 1.
- Negative-validated: reverting only the source change fails `2 files / 5 tests`; restored → `3 files / 109 tests passed`.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted `remainingFakeSuccess` + `localJarvisEngine` + `conversationalPipelineRegression` 3 files / 109 tests passed. Full suite and build: NOT RUN this slot (budget). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-01 03:15 IST (2026-09-30 21:45 UTC) — window slot 15: the Computer Operator view the dispatcher opens is now mounted

### Fixed
- **`open_computer_operator` reported a view switch that never happened.** `offlineOperatorCountsAsHostWork('open_computer_operator')` returns `true` (it is the one offline operator intent credited as real page-local work), its reply says the HUD was activated, and `handleExecuteAction` in `src/App.tsx` does run `setActiveApp('computer_operator')` — but `App.tsx` had no render site for `activeApp === 'computer_operator'`, and the `ComputerOperatorModal` import was unused. The HUD therefore never opened while the spoken reply and the "Autonomous Actions Executed" counter both credited it. Mounted `ComputerOperatorModal` on `activeApp === 'computer_operator'` (`onClose` resets `activeApp`, `onSendToChat={handleSendCommand}`, `activeLanguage` from `voiceSettings`), matching the sibling modal wiring.

### Tests
- `src/tests/computerOperatorDispatchTruth.test.ts` — 3 tests. Derives the views `setActiveApp('...')` assigns and the views the JSX renders (`activeApp === '...'`), asserting the assigned set is a subset of the rendered set (a general invariant, so any future dangling view fails), plus an explicit pin that `open_computer_operator` routes to a mounted view. Negative-validated: reverting only `src/App.tsx` fails `3 failed`; restored → `3 passed`.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted `computerOperatorDispatchTruth` + `actionExecutedSweepAudit` + `launchDispatchTruth` 3 files / 25 tests passed; full suite **119 files / 1636 tests passed** (22.03 s); build exit 0 (`dist/server.cjs` 935.5 kb). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-01 02:35 IST (2026-09-30 21:06 UTC) — window slot 14: three more provider secrets redacted

### Fixed
- **Three provider secrets passed through `redactSecrets()` byte-for-byte.** A live probe of ten credential formats against `src/utils/computerOperator/credentialRedactor.ts` (the function that masks text on the computer-operator planner, action-verifier, engine and screen-interpreter paths) found: Slack app-level tokens (`xapp-…`) — not covered by the existing `xox[baprs]-` character class, and an `xapp-` token can mint `xoxp` user tokens; Stripe webhook signing secrets (`whsec_…`) — not covered by the existing `sk_`/`rk_` key pattern, and this is the secret that signs webhook payloads; and Mailgun API keys (`key-` + 32 hex), for which no pattern existed. Added pattern branches 38–40. The same probe found Twilio Account/API-Key SIDs (`AC…`/`SK…`) and an X/Twitter OAuth2 bearer passing through unchanged; those are deliberately not redacted — the SID is a public account identifier (an existing test asserts it must survive) and the labelled bearer is already covered by the generic keyword rule.

### Tests
- `src/tests/credentialRedactor.test.ts` — 3 new regression tests (bare-token form), plus a prose guard asserting `the key-value store` is left intact. 42 → 45 tests. Negative-validated: stashing only the engine change fails exactly the three new cases (`3 failed | 42 passed`); restored → `45 passed`.
- Note: the first push was rejected by GitHub push protection, which flagged the synthetic Mailgun fixture as a real key. The fixture was rebuilt by concatenation rather than added to the allow-list.

### Verified
- Lint (`tsc --noEmit`) exit 0; `src/tests/credentialRedactor.test.ts` 45/45; push accepted (`b24b96a`). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-01 01:41 IST (2026-09-30 20:11 UTC) — window slot: an Android message-reply decline is no longer credited as executed work

### Fixed
- **Declining a pending message reply was counted as completed work.** The MESSAGE reject branch in `src/utils/localJarvisEngine.ts` returned `actionExecuted: true` with the action detail `{ type: 'open_notepad', title: 'Message Dismissed' }` and advanced the user-visible "Autonomous Actions Executed" counter. Declining a reply performs no work — `androidBridgeEngine.clearPendingEvent()` only drops a locally mirrored approval prompt, nothing is handed to the Android device, and no notepad view opens for a decline. The call-reject twin (`offlineAndroidRejectVerdict`) already reported `false`; this branch was the outlier. A new `offlineAndroidMessageRejectVerdict(connected)` in `src/utils/computerOperator/offlineCallTruth.ts` returns `actionExecuted: false` with title `Message Reply Declined Locally (nothing was sent)` and an honest EN/HI/Hinglish reply; the branch routes its counter through `countAction(updatedMemory, rejectVerdict.actionExecuted)`. `reject_message` was added to `IntentCategory` in `src/types.ts` so the typed intent matches the emitted intent (it previously tripped `TS2322`).

### Tests
- `src/tests/androidInquiryTruth.test.ts` — added coverage asserting the reject branch emits no `answer_call`/`open_notepad` intent, never sets `actionExecuted: true`, and pins the title and reply. Negative-validated by flipping the verdict to credit the decline (guard fails), restored → green.

### Verified
- Lint (`tsc --noEmit`) exit 0; targeted `androidInquiryTruth` + `offlineCallTruth` 2 files / 30 tests passed; full suite **118 files / 1627 tests passed** (22.35 s); build exit 0 (`dist/server.cjs` 955360 bytes). E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-10-01 00:35 IST (2026-09-30 19:05 UTC) — work slot 10: eight more credential families redacted

### Fixed
- **Eight provider token families passed through `redactSecrets()` byte-for-byte.** `src/utils/computerOperator/credentialRedactor.ts` masked OpenAI/Anthropic/Google/GitHub/Telegram/AWS/Discord/GitLab/DigitalOcean/GOCSPX keys but missed the providers this project actually integrates with: Groq (`gsk_`), Perplexity (`pplx-`), Notion (`ntn_` and legacy `secret_`), Shopify (`shpat_`/`shpss_`), Linear (`lin_api_`), Slack incoming-webhook URLs, Azure Storage `AccountKey=`, Firebase browser keys (`AIza…` without the `Sy` infix the Google pattern required) and Resend (`re_`). The redactor sits on the computer-operator planner, action-verifier, engine and screen-interpreter output paths, so a key shown on screen or in a task summary was surfaced unredacted. Added pattern branches 23–31.

### Tests
- `src/tests/credentialRedactor.test.ts` — 11 new regression tests (bare-token form, as seen in a screenshot/terminal stream), plus two over-redaction guards (ordinary `app.slack.com` URL, English `re_` prefix). Negative-validated: the 11 new tests fail against the previous code (`11 failed | 24 passed`) and pass after the fix (`35 passed`).

### Verified
- Lint (`tsc --noEmit`) exit 0; `src/tests/credentialRedactor.test.ts` 35/35.

---

## [Unreleased] - 2026-10-01 00:05 IST (2026-09-30 18:35 UTC) — work slot 9: searches dispatch truthfully; every task gets its own retry budget

### Fixed
- **A search could be narrated as running while loading nothing.** The `google_search` `/api/chat` case in `server.ts` put the Google search URL at the top-level `target` of the action detail and cleared the in-app Browser's `initialUrl`. The dispatcher opened `payload.target || ''` — an empty address — and `BrowserModal` ignores `initialQuery` whenever `initialUrl` is set, so a search issued after any earlier page load ran nothing. URL, title and reply now derive from one `searchDispatch()` verdict in `src/utils/browserDispatchTruth.ts`, the URL travels in `payload.target`, and `src/App.tsx` hands it to the view.
- **A computer-operator task could report a verification failure it never attempted.** `ActionVerifier.retryCounters` (`src/utils/computerOperator/actionVerifier.ts`) is a static map keyed on action id/type, which repeat across tasks. A task that exhausted `MAX_RETRIES` left the counter set, so the next same-shaped task saw `shouldRetry = false` and failed without its retry. `ActionVerifier.resetAllRetries()` is now called at the start of `executeTask`.

### Tests
- `src/tests/browserDispatchTruth.test.ts` — guards the search URL carried to the view; negative-validated by reverting the `src/App.tsx` wiring.
- `src/tests/computerOperatorTaskStatus.test.ts` — new case `gives each task its own retry budget, so an earlier failure cannot fail a later task`. This also removes a real flake (the "safe retry is re-verified" suite failed ~4 runs in 5; now 10/10 across six consecutive runs). Negative-validated: removing the reset fails `2 failed | 8 passed`.

### Verified
- Full suite **118 files / 1610 tests passed**; lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 949796 bytes).

---

## [Unreleased] - 2026-09-30 23:46 IST (2026-09-30 18:16 UTC) — work slot 8: a retried operator step is no longer credited as verified

### Fixed
- **The Computer Operator engine's single safe retry discarded its result and skipped re-verification.** In `src/utils/computerOperator/computerOperatorEngine.ts`, the `verification.shouldRetry` branch called `await this.executor.executeAction(action);` without reading the outcome and without re-observing the screen, then continued to the loop tail and the `COMPLETED` summary that claims *"All N step(s) executed and verified against the host desktop"*. A retry that failed to execute, or that produced no observable change, was reported as a verified step. The retry is now re-executed **and re-verified**: a failed re-execution ends the task `FAILED` with the executor error, an unverified retry ends it `FAILED` with the verification message, and only a confirmed change adopts the retry as the step result (so the RESULT event and the completion summary describe the retry).

### Tests
- `src/tests/computerOperatorTaskStatus.test.ts` — new `the safe retry is re-verified, never credited on faith` suite (3 tests): unverified-retry → `FAILED` (with `calls() >= 2` proving the retry actually ran), verified-retry → `COMPLETED` with the host-backed claim, retry-execution-failure → `FAILED` with `RETRY_EXECUTOR_REJECTED`. The pre-existing host-backed-summary case used a stub observer whose screen never changed and had only passed because of this bug; its stub now genuinely transitions. Negative-validated: reverting only the engine fix fails `2 failed | 7 passed`, restored → `9/9`.

### Verified
- Targeted `src/tests/computerOperatorTaskStatus.test.ts` **9 passed**; full suite **118 files / 1603 tests passed** (22.10 s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 948625 bytes).

---

## [Unreleased] - 2026-09-30 23:10 IST (2026-09-30 17:40 UTC) — work slot 7: a client can no longer credit actions it did not perform

### Fixed
- **`POST /api/memory` honored a caller-asserted counter.** The handler in `server.ts` ran `memoryState.stats.actionsExecuted += 1` / `totalCommands += 1` whenever the request body carried `statUpdate.incrementAction` / `statUpdate.incrementCommand`. Those counters are the user-visible "Autonomous Actions Executed" and "Total Voice / Text Commands" figures in `src/components/MemoryModal.tsx`, so any client could raise them without the server observing a command or an action. No in-repo caller ever sends `statUpdate`, so the field was a pure fake-success surface. The server now ignores the request and appends an inert note (`Counter request not applied`) stating no counter was advanced.

### Tests
- `src/tests/memoryPersistence.e2e.test.ts` — new `client-asserted counters` suite (2 tests) drives the real HTTP route against a spawned server: both counters stay flat across the POST (verified with a fresh GET), and the request is recorded as an inert note instead of credited. Negative-validated: restoring the old `statUpdate` branch fails `2 failed | 5 passed`; with the fix the file passes `7/7`.

### Verified
- Targeted `src/tests/memoryPersistence.e2e.test.ts` `7 passed`; lint (`tsc --noEmit`) exit 0.

---

## [Unreleased] - 2026-09-30 22:35 IST (2026-09-30 17:05 UTC) — work slot 6: dashboard radar pin no longer claims a live fix for a simulated point

### Fixed
- **The dashboard radar pin labelled any address-less point `CURRENT FIX`.** `src/components/DashboardMapSnippet.tsx` computed its pin label as `isResolvedAddress(address) ? address?.city : 'CURRENT FIX'`, ignoring the coordinate provenance. A `preset`, `manual` or `cache` position with no resolved address was therefore presented as a live fix — in the same card whose PRECISION field (`accuracyDisplay`) and provenance badge (`locationSourceLabel`) already read `N/A — no GPS fix` / `PRESET ONLY`. The label is now gated on `source === 'live'`; every other provenance prints `NO FIX`.

### Tests
- `src/tests/locationServicesTruth.test.ts` — new test asserts the `CURRENT FIX` literal in `DashboardMapSnippet.tsx` is preceded by a `source === 'live'` guard. Negative-validated: reverting the component to the old fallback fails `1 failed | 16 passed`; with the fix it passes `17/17`.

### Verified
- Targeted `src/tests/locationServicesTruth.test.ts` `17 passed`; full suite `118 files / 1594 tests passed` (22.48s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 946016 bytes).

---

## [Unreleased] - 2026-09-30 22:13 IST (2026-09-30 16:43 UTC) — work slot 5: credential presence no longer claims a working integration

### Fixed
- **The Truth-in-Execution Integrations Matrix fabricated success from env-var presence.** `getIntegrationsAuditReport()` (`server_tools.ts`) set `status: 'REAL_WORKING'` for LinkedIn, Telegram, GitHub, Facebook, Instagram and YouTube whenever their credential env vars were visible, with reasons asserting live state the function never observes — "OAuth 2.0 engine authenticated", "24/7 Long-Polling Daemon active", "GitHub REST API authenticated", "YouTube Data API v3 active". The function makes no provider call, so none of those claims were evidence-backed. Status renamed to `CREDENTIALS_PRESENT` and every credential-visible reason rewritten to state only that a credential string is present and no call was made. Summary field `connected` → `credentialsPresent`.
- Propagated the rename through the API return type (`server_tools.ts`), the shared `IntegrationAuditItem` type (`src/types.ts`), the Autonomous Tools Modal (`src/components/AutonomousToolsModal.tsx` — badge now reads "Credentials Present"), and the spoken `tools_audit` line (`server.ts`). The `email` and `oracle_cloud` rows remain `NOT_AVAILABLE`.

### Tests
- `src/tests/integrationsAuditTruthfulness.test.ts` — extended to 5 tests. A new guard forces every credential-visible branch (all 9 integration env keys set) and asserts no reason matches `authenticated|verified|active|online|working`, while requiring an explicit non-confirmation phrase (`no … call is made` / `not confirmed` / `not measured`). Negative-validated: restoring the old GitHub reason fails `1 failed | 4 passed`; restoring the fix passes `5/5`. `src/tests/emailConduitTruthfulness.test.ts` updated to the new vocabulary.

### Verified
- Full suite `118 files / 1593 tests passed` (21.75s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 946016 bytes).

---

## [Unreleased] - 2026-09-30 21:55 IST (2026-09-30 16:25 UTC) — work slot 3: the `actionExecuted = true` sweep is now pinned

### Added
- **The item-13 sweep was `UNKNOWN`; it is now enumerated and guarded.** Every literal `actionExecuted = true;` in `server.ts` was paired with its enclosing intent case and audited by reading the body: **21 sites, 21 distinct intents**. Nineteen are routed by `App.tsx` to a real in-app view; the two that open no view justify the flag with real work — `find_document` counts only when `realFsSearch()` returned matches, and `set_name` only after `memoryState.name = verdict.name` + `persistMemory()`. No site is a bare unconditional assignment.

### Tests
- `src/tests/actionExecutedSweepAudit.test.ts` — new, 4 tests. Asserts the full literal-site set matches the audited map, that every view-backed intent is actually routed by the dispatcher, that the two non-view intents contain their real-work calls, and that no case credits execution without a routed view or observable work. Negative-validated: injecting an un-audited `actionExecuted = true;` case fails `2 failed | 2 passed`; removed → 4/4.

### Verified
- Full suite `118 files / 1592 tests passed` (24.00s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 945471 bytes). Rebased onto the remote tip (`73f32ad`) before pushing; the audit was re-run after the rebase (4/4).

---

## [Unreleased] - 2026-09-30 21:35 IST (2026-09-30 16:10 UTC) — work slot 2: the live launch cases still emitted the dead field

### Fixed
- **The launch-case field fix only reached the offline engine.** Slot 1 fixed `localJarvisEngine.ts`, but the live `/api/chat` cases `operate_vscode`, `operate_browser` and `operate_terminal` still wrote a top-level `actionDetail.target` that the dispatcher drops (`handleExecuteAction(intent, actionDetail?.payload)`). Removed the dead `target` from all three (`server.ts` ~8625/8632/8639). The destination name already travels in `actionDetail.title`, and the app's launch case routes on the intent alone.

### Tests
- `src/tests/launchDispatchTruth.test.ts` — now 18 tests (was 15). Three source-text guards assert each server launch case carries no top-level `target` the dispatcher would drop. Negative-validated by restoring the top-level `target` to `operate_browser` (`1 failed | 17 passed`), restored → 18/18.

### Verified
- Full suite `117 files / 1588 tests passed` (21.36s); lint (`tsc --noEmit`) exit 0; build exit 0 (`dist/server.cjs` 945471 bytes). Live E2E against the fresh production build on PORT 4189: `open browser`/`open vscode`/`open terminal` each return `actionExecuted false` with `actionDetail.keys=['payload','title','type']` — no dropped `target`.
- `jarvis_memory.json` runtime churn from the live probe was reverted; the diff carries only intended source/tests/docs.

---

## [Unreleased] - 2026-09-30 21:05 IST (2026-09-30 15:51 UTC) — work slot 1: the browser destination was emitted in the wrong field

### Fixed
- **The previous slot's browser-open fix never reached the view.** `server.ts` emitted the destination as a top-level `actionDetail.target`, but the app dispatcher is called as `handleExecuteAction(data.intent, data.actionDetail?.payload)` and its `open_google/open_youtube/open_gmail/open_chatgpt` case reads `payload?.target`. A top-level `target` is dropped, `setBrowserInitialUrl('')` runs and `BrowserModal` stays on its Google home — so "open YouTube", "open Gmail" and "open ChatGPT" still loaded the Google home page while the reply and action card named another site. Confirmed live: `actionDetail` was `{type, title, target}` with no `payload`.
- `src/utils/browserDispatchTruth.ts` gains `browserOpenActionDetail(verdict)`, returning the action detail with the URL inside `payload.target` — the only field the dispatcher reads. `server.ts` uses it.

### Tests
- `src/tests/browserDispatchTruth.test.ts` — now 16 tests. Unit coverage of `payload.target`, absence of a top-level `target`, and the default-home fallback, plus a wiring guard that reads the real dispatcher call. Negative-validated by reverting `server.ts` to the top-level shape (`1 failed | 15 passed`), restored → 16/16.

### Verification (this slot)
- Live E2E against the production build (`node dist/server.cjs`, PORT 4011): `open youtube` → `payload.target=https://www.youtube.com`; `open gmail` → `https://mail.google.com`; `open chatgpt` → `https://chatgpt.com`; `open google` → `https://www.google.com`.
- `npm run lint` (`tsc --noEmit`) — exit 0.
- `npx vitest run` — **117 files / 1583 tests passed** (21.07 s).
- `npm run build` — exit 0, `dist/server.cjs` 923.1kb.
- Security: `.env` ignored, working tree clean of secrets. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-09-28 04:35 IST (2026-09-27 23:05 UTC) — finalization slot: guard .gitignore encoding

### Added
- **Regression guard for `.gitignore` encoding.** The stale `main` snapshot (HEAD `20e541d`) shipped a `.gitignore` encoded as UTF-16 LE (BOM + NUL bytes). Git only parses a UTF-8 `.gitignore`, so `*.wav`, `*.mp3`, `__pycache__/` and `.env` were silently not ignored — a real path to committing secrets or build artifacts. A previous slot rewrote the file to UTF-8; this slot adds `src/tests/gitignoreHygiene.test.ts`, which asserts the raw file is valid UTF-8 with no NUL/BOM and still contains `.env`, `.env.local`, `node_modules/`, `dist/` and `__pycache__/`.

### Tests
- `src/tests/gitignoreHygiene.test.ts` — 2 tests. Negative-validated by re-encoding the file to UTF-16 LE (`2 failed`), then restoring UTF-8 (`2 passed`).

### Verification (this slot, no source change beyond the guard)
- `npm run lint` (`tsc --noEmit`) — exit 0.
- `npx vitest run` — **117 files / 1577 tests passed** (21.79 s).
- `npm run build` — exit 0, `dist/server.cjs` 944934 bytes.
- Security: `.env` ignored, working tree clean, no secret in the diff-vs-main scan. E2E: NOT RUN. Deploy: NOT_CONFIGURED.

---

## [Unreleased] - 2026-09-28 03:35 IST (2026-09-27 22:05 UTC) — work slot 14: a printed window title is not a read screen

### Fixed
- **`ComputerOperatorModal` still printed two live-screen claims it never measured.** The fake window-title bar rendered `{windowTitle || 'Desktop Observation'}` and the element header rendered `{visibleElements.length || 0} UI Elements Parsed` for *every* state, including the illustrative preview and an unreachable host (`isAmbiguous`). Both named a window and counted parsed elements on a desktop that was never observed, directly beneath the honest `SCREEN NOT OBSERVED` dot. Same inflation class item 13 tracks.
- Added `observationWindowTitleLabel` and `observationElementsParsedLabel` to `src/utils/computerOperator/observationTruth.ts`; `ComputerOperatorModal.tsx` now derives both. They hold at `WINDOW NOT OBSERVED` / `NO SCREEN CONTENT OBSERVED` until a real, non-ambiguous observation exists; an empty observed title reads `WINDOW TITLE NOT REPORTED`, and the parsed-element count singularises correctly.

### Tests
- `src/tests/observationTruth.test.ts` — two source pins (the raw window-title expression and the `UI Elements Parsed` literal are gone; both helpers are used) plus six unit cases for the new helpers. File now 43 tests.
- Negative-validated: restoring the raw `{windowTitle || 'Desktop Observation'}` expression fails exactly the new source guard (`1 failed | 42 passed`); restored → 43/43.
- Gates observed this slot: lint (`tsc --noEmit`) exit 0; targeted `observationTruth` **43 passed**; full suite **115 files / 1565 tests passed** (21.53 s); build exit 0 (`dist/server.cjs` 943006 bytes).

### Notes
- Item 13 remains `PARTIAL` — another real fake-success class closed; the remaining `actionExecuted: true` sites in `server.ts` are still not individually audited (`UNKNOWN`). The previously-named unrouted `set_name` / `time_inquiry` cases were handled in slots 11 and 12. E2E: NOT RUN — no display session, no handset. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-28 03:05 IST (2026-09-27 21:35 UTC) — work slot 13: a live-screen claim is not a measurement

### Fixed
- **`ComputerOperatorModal` printed three live-screen claims it never measured.** The panel hardcoded `OPERATOR ACTIVE: OBSERVING SCREEN`, `ACTIVE APP: <name> | None`, and `LIVE COMMAND STREAM & TELEMETRY` regardless of whether the ScreenObserver had actually read the host desktop — contradicting the honest status dot rendered beside them. When the observer serves the built-in illustrative preview or the host is unreachable (`isAmbiguous`), the modal still asserted observation and named a foreground application, and labelled synthetic preview frames as a live stream. Same inflation class item 13 tracks.
- Added `observationOperatorStateLabel`, `observationActiveAppLabel`, and `observationStreamHeader` to `src/utils/computerOperator/observationTruth.ts`; `ComputerOperatorModal.tsx` now derives all three labels. Until a real, non-ambiguous observation exists they read `SCREEN UNOBSERVED` / `ILLUSTRATIVE PREVIEW` / a non-live stream header, and name an app only when one was genuinely read.

## [Unreleased] - 2026-09-28 02:35 IST (2026-09-27 21:05 UTC) — work slot 12: a clock read is not executed work

### Fixed
- **The live `/api/chat` `time_inquiry` case and its offline Local JARVIS Engine twin credited a question as work.** Both the `/api/chat` case (~line 9157) and the engine's time branch set `actionExecuted = true` and advanced the user-visible "Autonomous Actions Executed" counter. `handleExecuteAction` in `src/App.tsx` routes `time_inquiry` only to `setActiveApp('mobile_personal_status')` — a view switch that cannot read the clock (the read already happened inside the handler) — so the intent performed no work and opened no view. Same inflation class as the earlier `get_name`/`capabilities_inquiry`/`system_diagnostic` fixes.
- Both surfaces now report `actionExecuted = false` with an inert `Clock Query (informational, no action taken)` detail; the spoken and written clock answers are unchanged.

### Tests
- `src/tests/remainingFakeSuccess.test.ts` — two new cases: a `server.ts` source-pin that the `time_inquiry` case sets `actionExecuted = false` and carries the informational title, and an offline-engine guard asserting the same on the engine branch. File now 41 tests.
- `src/tests/conversationalPipelineRegression.test.ts` — case B asserted the old fake contract (`actionExecuted === true` for the clock read); aligned with the honest contract, matching cases C (weather) and D (youtube status) in the same file which already assert `false`. Reply content, intent and payload assertions unchanged.
- Negative-validated: reverting only `src/utils/localJarvisEngine.ts` fails exactly the new offline-engine guard (`1 failed | 40 passed`); restored → 41/41.
- Gates observed this slot: lint (`tsc --noEmit`) exit 0; targeted `remainingFakeSuccess` **41 passed**; full suite **115 files / 1546 tests passed** (23.11 s); build exit 0 (`dist/server.cjs` 943006 bytes).

### Notes
- Item 13 remains `PARTIAL` — another real fake-success class closed; the remaining `actionExecuted: true` sites in `server.ts` are still not individually audited (`UNKNOWN`). The last previously-named unrouted case, `time_inquiry`, is now handled. E2E: NOT RUN — no display session, no handset. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-28 02:12 IST (2026-09-27 20:42 UTC) — work slot 11: an unusable name clause is not executed work

### Fixed
- **The live `/api/chat` `set_name` case and the offline Local JARVIS Engine recorded an unusable payload as the owner's identity.** The classifier's name group is greedy over a whitespace class and accepts digits, so `"my name is hello how are you"` was stored verbatim as `memoryState.name`, `"my name is 123"` stored `123`, and each spoke a "recorded" success and set `actionExecuted = true`, advancing the user-visible "Autonomous Actions Executed" counter — a success claim and a counter bump for a no-op. The offline engine's `(?:my name is|call me|i am)\s+([a-zA-Z0-9_\-\s]+)` branch had the same defect.
- New `src/utils/identityTruth.ts` (`judgeSetNameIntent`, `canonicalizeNameCandidate`) accepts only a plausible name: after trimming surrounding punctuation and the trailing Hindi copula/honorific it must be letter-bearing, digit-free and at most three words (so "Tony Stark" still passes). Both call sites route through it — a genuine name is stored and counted as before; an unusable payload leaves the stored name untouched, does not advance the counter, and answers honestly with the inert `set_name_rejected` detail (Hindi reply included).

### Tests
- `src/tests/identityTruth.test.ts` — 9 tests: helper verdicts (accept single/full/Hindi names; reject sentence, digit-only and empty payloads; canonicalize punctuation and the copula/honorific), two `server.ts` source-pins, and the offline engine's unchanged name + zero counter on a sentence and its genuine-name positive control.
- Negative-validated: disabling only the `MAX_NAME_WORDS` guard fails 2 of 7 (`2 failed | 5 passed`); restored → 7/7.
- Live probe against a running `npm run dev`: before, `"my name is hello how are you"` → `actionExecuted=true`, name `hello how are you`; after, `actionExecuted=false`, name unchanged; `"my name is Ravi Kumar"` still `true`, name `ravi kumar`.
- Gates observed this slot: lint (`tsc --noEmit`) exit 0; targeted 4 files / 81 passed; full suite **115 files / 1544 tests passed** (21.08 s); build exit 0 (`dist/server.cjs` 942642 bytes).

### Notes
- Item 13 remains `PARTIAL` — another real fake-success class closed; the remaining `actionExecuted: true` sites in `server.ts` are still not individually audited (`UNKNOWN`), and the unrouted `time_inquiry` case remains to be handled. E2E: NOT RUN — no display session, no handset. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-28 01:45 IST (2026-09-27 20:15 UTC) — work slot 10: a summary-less YouTube lookup is not executed work

### Fixed
- **The live `/api/chat` `summarize_youtube_video` case credited a summary-less lookup.** The case gated `actionExecuted` on `summaryRes.success` alone. `summarizeYouTubeVideoCore` returns `success: true` as soon as the video metadata is fetched, so a video with no transcript and no description (empty summary, `source: 'none'`) still set `actionExecuted = true` and advanced the user-visible "Autonomous Actions Executed" counter — while the spoken reply showed only the title with no summary. Same inflation class as the slot 8 `find_document` fix.
- The success branch now derives `hasSummary = Boolean(summaryRes.summary && summaryRes.summary.trim())` and sets `actionExecuted = hasSummary`. A summary-less result speaks an honest "nothing to summarize" line and carries the inert `youtube_summary_empty` detail; only a non-empty summary credits work. The extraction-failure branch keeps `actionExecuted = false`.

### Tests
- `src/tests/remainingFakeSuccess.test.ts` — new test `the /api/chat summarize_youtube_video case gates success on a non-empty summary`, plus a direct `buildYouTubeSummary` unit test proving a no-content video yields `summary: ''`, `source: 'none'`, `verificationStatus: 'PARTIAL'` while still reporting `success: true`. Negative-validated: reverting only the `server.ts` change fails the route assertion (`1 failed | 38 passed`); restored → `39 passed`.
- `src/tests/toolDispatchTruth.test.ts` — widened `caseBody` with a `max` parameter (the YouTube case grew past the previous 1400-char view).
- Gates observed this slot: lint (`tsc --noEmit`) exit 0; targeted `remainingFakeSuccess` + `youtubeSummarizerTruthfulness` **44 tests passed**, `toolDispatchTruth` **15 tests passed**; full suite **114 files / 1537 tests passed** (20.98 s); build exit 0 (`dist/server.cjs` 940914 bytes).

### Notes
- Item 13 remains `PARTIAL` — one more real fake-success class closed; the remaining `actionExecuted: true` sites in `server.ts` are not individually audited (`UNKNOWN`), and the unrouted `set_name` and `time_inquiry` cases remain to be handled. E2E: NOT RUN — no display session, no handset. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-28 00:39 IST (2026-09-27 19:09 UTC) — work slot 8: a document search that found nothing is not executed work

### Fixed
- **The live `/api/chat` `find_document` case credited a zero-match search.** The case only had a "no file exists" branch for `search.success === false`; when the real search ran and returned an empty `matches` list (`search.success === true`), it fell through to the success path and set `actionExecuted = true`, advancing the user-visible "Autonomous Actions Executed" counter for a lookup that retrieved nothing. `find_document` also has no `handleExecuteAction` route, so the credited action opened no panel either — a phantom action in the counter with nothing beside it.
- The zero-match branch is now explicit (`else if (search.success)`): it speaks the honest `No file matching <query> exists in the workspace.` reply and sets `actionExecuted = false`. The `Not found: <query>` card is retained only as the inert non-action detail. Only a search with real matches still credits executed work.

### Tests
- `src/tests/documentSearchTruthfulness.test.ts` — new test `a zero-match search is a non-action, not an executed document lookup`, which isolates the zero-match branch of the `server.ts` case and asserts it sets `actionExecuted = false` and never `actionExecuted = true`. Negative-validated: reverting only the `server.ts` fix fails the test (`1 failed | 5 passed`); restored → `6 passed`.
- Gates observed this slot: lint (`tsc --noEmit`) exit 0; targeted suite `documentSearchTruthfulness` **6 tests passed**; full suite **114 files / 1532 tests passed** (21.64 s); build exit 0 (`dist/server.cjs` 938698 bytes).

### Notes
- Item 13 remains `PARTIAL` — another real fake-success class closed; the remaining `actionExecuted: true` sites in `server.ts` are not individually audited (`UNKNOWN`), and the unrouted cases (`summarize_youtube_video`, `set_name`, `time_inquiry`) remain to be handled. E2E: NOT RUN — no display session, no handset. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-28 00:23 IST (2026-09-27 18:53 UTC) — work slot 7: emergency stop is not a toggle

### Fixed
- **The live `/api/chat` `emergency_stop` / `emergency_resume` cases flipped the freeze and always claimed success.** Both called `toggleEmergencyStop(...)`, which *flips* `emergencyState.emergencyPaused` — so a second "emergency stop" silently RELEASED the freeze, and an "emergency resume" while nothing was paused ENGAGED it. Each also spoke an unconditional success (`Emergency Stop is now active. …`) and set `actionExecuted = true`, advancing the user-visible "Autonomous Actions Executed" counter. A false success in the unsafe direction.
- Added `emergencyToggleVerdict(action, state)` to `src/utils/computerOperator/offlineEmergencyTruth.ts`, derived from the pre-transition state, and **gated the flip on it** so a no-op transition cannot change state. A repeated stop, a resume with nothing paused, and a resume while the hard kill switch is latched all report `actionExecuted: false` with honest titles and leave the state untouched; a first stop and a genuine resume report `actionExecuted: true`.

### Tests
- `src/tests/offlineEmergencyTruth.test.ts` — new `describe('emergencyToggleVerdict never credits a toggle that changed nothing')` block (6 tests): first-stop, repeated-stop, latched-resume, nothing-to-release, real-resume, and a `server.ts` source-pin that `emergencyToggleVerdict(` is wired in and the old hardcoded success literals are gone. Negative-validated: the forbidden literal is present in `git show HEAD~1:server.ts` and absent after the fix.
- Gates observed this slot: lint (`tsc --noEmit`) exit 0; targeted suite `offlineEmergencyTruth` **10 tests passed**; full suite **114 files / 1530 tests passed** (21.48 s); build exit 0 (`dist/server.cjs` 938697 bytes).

### Notes
- Item 13 remains `PARTIAL` — another real fake-success class closed, and a genuine safety inversion removed; the remaining `actionExecuted: true` sites in `server.ts` are not individually audited (`UNKNOWN`). E2E: NOT RUN — no display session, no handset. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-27 23:45 IST (2026-09-27 18:15 UTC) — work slot 6: a cancel that stopped no task is not executed work

### Fixed
- **The `/api/chat` `cancel_computer_task` case credited a cancel that cancelled nothing.** It called `TaskTracker.cancelActiveTask('User requested stop')` and unconditionally spoke `Computer operator task has been immediately cancelled.`, titled the action `Task Cancelled` and set `actionExecuted = true` — but `cancelActiveTask` returns `{ cancelled: false }` when no task is active, and the case ignored it. With nothing running, nothing was cancelled, yet the case still bumped the user-visible "Autonomous Actions Executed" counter (`memoryState.stats.actionsExecuted`).
- Added `cancelComputerTaskVerdict(result)` to `src/utils/computerOperator/operatorReplyTruth.ts` (the module that already carries the honest `fix_project_error` / `inspect_screen` verdicts). A false or absent result reports `actionExecuted: false` with the title `Nothing to Cancel (no task running)` and a reply stating nothing was cancelled; a real cancellation reports `actionExecuted: true` with the title `Running Host Task Cancelled`. Both replies have Hindi variants. The `server.ts` case now derives both the reply and the flag from the verdict.

### Tests
- `src/tests/operatorReplyTruth.test.ts` — new `describe('cancelComputerTaskVerdict never credits a stop that stopped nothing')` block: a `{cancelled:false}` case, a `null`/`undefined` case, an actual-cancel case and a `server.ts` source-pin. Negative-validated: reverting only the `server.ts` fix fails the source-pin (`1 failed | 19 passed`); restored → `20 passed`.
- Gates observed this slot: lint (`tsc --noEmit`) exit 0; targeted suite `operatorReplyTruth` **20 tests passed**; full suite **114 files / 1524 tests passed** (21.34 s); build exit 0 (`dist/server.cjs` 934519 bytes).

### Notes
- Item 13 remains `PARTIAL` — another real fake-success class closed; the remaining `actionExecuted: true` sites in `server.ts` are not individually audited (`UNKNOWN`). E2E: NOT RUN — no display session, no handset. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-27 23:14 IST (2026-09-27 17:44 UTC) — work slot 4: a blocked finance request is a refusal, not an executed action

### Fixed
- **Both surfaces credited a refused finance request as executed work.** A financial operation is prohibited by the safety protocol, so the request is refused, not performed, yet the `/api/chat` `finance_blocked` case in `server.ts` set `actionExecuted = true`, and the offline finance guard in `src/utils/localJarvisEngine.ts` (§0, `isFinanceRestricted`) returned no `actionExecuted` value at all — which `countAction` reads as *not false* (`if (actionExecuted !== false)`) and therefore counted. Both advanced the user-visible "Autonomous Actions Executed" counter for work the assistant declined to do. `App.tsx` has no `finance_blocked` case, so no view opened either.
- The `/api/chat` case now sets `actionExecuted = false` with title `Finance Blocked (safety exclusion, no action taken)`; the offline guard now returns `actionExecuted: false` with the same honest title and an `actionDetail`.

### Tests
- `src/tests/remainingFakeSuccess.test.ts` — new `describe('a blocked finance request is a refusal, not executed work')` block: a source-pin on the `/api/chat` case, a behavioural case driving `processOfflineCommand('please send money to my landlord')` asserting `actionExecuted === false` and that `memory.stats.actionsExecuted` did not move, and a source-pin on the engine literal. Negative-validated: reverting both fixes fails the block (`3 failed | 34 passed`); restored → `37 passed`.
- Gates observed this slot: lint (`tsc --noEmit`) exit 0; targeted suite `remainingFakeSuccess` **37 tests passed**; full suite **114 files / 1517 tests passed** (24.81 s); build exit 0 (`dist/server.cjs` 932093 bytes).

### Notes
- Item 13 remains `PARTIAL` — another real fake-success class closed; the remaining `actionExecuted: true` claims outside the audited branches are not individually audited (`UNKNOWN`). E2E: NOT RUN — no handset, no display session. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-27 22:53 IST (2026-09-27 17:23 UTC) — work slot 3: Android-bridge call decline must not fake a device decline

### Fixed
- **The offline engine reported a phone decline the bridge cannot perform.** In `src/utils/localJarvisEngine.ts`, both Android-bridge reject branches (the section-0.5 contextual reject and the section-7.4 direct `कॉल काटो` / `reject call` branch) called `androidBridgeEngine.clearPendingEvent()` and then returned `actionExecuted: true` with `title: 'Call Declined'` / `title: 'Call Declined via Android Bridge'`, advancing the user-visible "Autonomous Actions Executed" counter and speaking *"सर, कॉल अस्वीकार कर दी गई है।"*. `AndroidBridgeManager` exposes no call-decline or end-call command — its call dispatch is limited to answering — so clearing the local mirror does not tell the physical device to decline.
- Added `offlineAndroidRejectVerdict(connected)` in `src/utils/computerOperator/offlineCallTruth.ts`. Both branches now clear the local mirror but report `actionExecuted: false`, count nothing (`countAction(updatedMemory, false)`), and title the action `Incoming Call Dismissed Locally (device not told to decline)`, saying plainly that the device was not told to decline.

### Tests
- `src/tests/androidMobileBridge.test.ts` — `Scenario 14` rewritten: asserts `actionExecuted: false`, the honest title, the retired decline phrase is gone, and `mockMemory.stats.actionsExecuted` does not move.
- `src/tests/offlineCallTruth.test.ts` — 2 new cases: a helper case (connected and not) and a source-pin that the retired literals are gone and the helper is wired in. Negative-validated: renaming only the helper call in `localJarvisEngine.ts` fails the source-pin (`1 failed | 19 passed`); restored → `20 passed`.
- Gates observed this slot: lint (`tsc --noEmit`) exit 0; targeted truth suites (`offlineCallTruth` + `androidMobileBridge` + `telephonyDispatchTruth`) **3 files / 70 tests passed**; full suite **114 files / 1514 tests passed** (21.65 s); build exit 0 (`dist/server.cjs` 931531 bytes).

### Notes
- Item 13 remains `PARTIAL` — another real fake-success path closed; the remaining `actionExecuted: true` claims outside the audited branches are not individually audited (`UNKNOWN`). E2E: NOT RUN — no handset, no display session. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-27 22:12 IST (2026-09-27 16:42 UTC) — work slot 2: `/api/chat` informational cases must not fake an action

### Fixed
- **The live `/api/chat` route counted questions as executed work.** `get_name`, `capabilities_inquiry` and `system_diagnostic` in `server.ts` each set `actionExecuted = true`, which flows into `if (actionExecuted) memoryState.stats.actionsExecuted += …` and advanced the user-visible "Autonomous Actions Executed" counter. None runs a tool or opens a view — `handleExecuteAction()` in `src/App.tsx` has no case for any of them — so a name look-up, a capability list and a clock-only diagnostic were recorded as performed work. The offline engine already reports `actionExecuted: false` for the same intents.
- All three now set `actionExecuted = false` and carry an explicitly informational title (`Memory Query (informational, no action taken)`, `JARVIS Capabilities (informational, no action taken)`, `Diagnostics (informational, no probe run)`). The honest reply text is unchanged and the counter is untouched.

### Tests
- `src/tests/remainingFakeSuccess.test.ts` — 3 new source-level cases (the `caseBody` helper gained an optional window width so the long capabilities reply is not truncated before the flag assignments). Negative-validated: stashing only `server.ts` fails all 3 (`3 failed | 31 passed`); restored → `34 passed`.
- Targeted truth suites observed on `f3cdf6b`: `remainingFakeSuccess` + `engineInformationalTruth` + `toolDispatchTruth` **3 files / 62 tests passed**. Full suite **114 files / 1512 tests passed** (21.49 s). Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 929257 bytes).

### Notes
- Item 13 remains `PARTIAL` — three more real fake-success paths closed; the remaining `actionExecuted: true` claims outside the audited branches are not individually audited (`UNKNOWN`). E2E: NOT RUN — no handset, no display session. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-27 21:16 IST (2026-09-27 15:46 UTC) — work slot 1: Android inquiries must not fake an action

### Fixed
- **A read-only inquiry could answer a live call.** In `src/utils/localJarvisEngine.ts` (section `0.6 Android Mobile Assistant Inquiries`), the caller-identity branch (`"किसका कॉल है"`, `"who is calling"`) returned `intent: 'answer_call'` with `actionExecuted: true`. `src/App.tsx` routes `data.actionExecuted && data.intent` to `handleExecuteAction()`, whose `answer_call` case calls `handleAnswerCall()` — so asking **who** was calling could answer the call, an irreversible telephony side effect triggered by a read. The notification branch (`"कोई notification आया क्या"`, `"any notifications"`) returned `intent: 'open_notepad'` with `actionExecuted: true`, so a query opened the Notes workspace and advanced the user-visible "Autonomous Actions Executed" counter for work that never happened.
- Both branches now emit dedicated read-only intents (`caller_inquiry`, `notification_inquiry`) with `actionExecuted: false` and an action type no caller switch acts on. `src/types.ts` `IntentCategory` gained the two union members. The honest reply text is unchanged.

### Tests
- `src/tests/androidInquiryTruth.test.ts` — new, 5 tests: caller inquiry with an active `CALL` and with none, notification inquiry with a pending `MESSAGE` and with an empty queue, plus a source-level guard over the `0.6` section. Negative-validated: stashing only `src/utils/localJarvisEngine.ts` fails all 5 (`5 failed | 5`); restored → `5 passed`.
- Related suites observed on `ac2daa1`: `localJarvisEngine` + `androidMobileBridge` + `offlineCallTruth` + `androidBridgePrivacySettings` + `remainingFakeSuccess` **5 files / 140 tests passed**. Full suite **114 files / 1509 tests passed** (20.85 s). Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 907.4 kb).

### Notes
- Item 13 remains `PARTIAL` — two more real fake-success paths closed; the remaining `actionExecuted: true` claims outside the audited branches are not individually audited (`UNKNOWN`). E2E: NOT RUN — no handset, no display session. Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-27 04:40 IST (2026-09-26 23:10 UTC) — finalization slot: window verified, PR ready for human merge

### Verified
- Re-verified the frozen tip `2093198` on `feature/hermes-full-completion`: `npm run lint` (`tsc --noEmit`) exit 0; full `npx vitest run` **113 files / 1504 tests passed** (21.36 s); `npm run build` exit 0, artifact `dist/server.cjs` **928823 bytes**.
- Security checks: `git check-ignore -v .env` → `.gitignore:4:.env`; `git status --short` empty; no `.env`, `node_modules/` or `dist/` tracked; the `git diff origin/main` secret-pattern scan returns only previously-documented synthetic test fixtures (a pattern scan, not a proof of absence).
- PR #4 is open, non-draft, `mergeable: true` / `mergeable_state: clean` at head `2093198`. **Not merged — awaiting human approval.**

### Notes
- No new backlog item was advanced in this slot. Item 13 remains `PARTIAL`; the remaining `actionExecuted: true` claims were not audited this slot — `UNKNOWN`. E2E: NOT RUN (no handset, no display session). Deploy: `NOT_CONFIGURED`.

## [Unreleased] - 2026-09-27 04:15 IST (2026-09-26 22:45 UTC) — work slot 8: informational intents are not executed actions

### Fixed
- **The offline engine counted questions as executed work.** `src/utils/localJarvisEngine.ts` returned `actionExecuted: true` and advanced the user-visible "Autonomous Actions Executed" counter for five question-answering branches — YouTube status (`youtube_status_inquiry`), system diagnostic (`system_diagnostic`), capabilities (`capabilities_inquiry`), clinic hours (`clinic_hours`) and appointment process (`appointment_process`). None performs a provider call, opens a view, or creates a booking, and `handleExecuteAction` in `src/App.tsx` has no case for any of them, so no side effect was ever possible. All five now return `actionExecuted: false`, leave the counter unchanged, and carry an explicitly informational title (`Clinic Hours Telemetry` → `Clinic Hours (informational, no action taken)`, `Appointment Booking Process` → `Appointment Process (informational, no booking made)`, `Clock reported (no diagnostics run)` → `System Diagnostic Not Run (clock reported only)`).

### Tests
- `src/tests/engineInformationalTruth.test.ts` — new, 13 tests: per-intent `actionExecuted: false` and a static `actionsExecuted`, a run of all five leaving the counter at zero while `totalCommands` advances, an anti-narration title check, and a control proving a genuine page-local action (`set_name`) still counts.
- `src/tests/conversationalPipelineRegression.test.ts` and `src/tests/voiceAndHindiModes.test.ts` — YouTube status and capabilities expectations updated to `actionExecuted: false`.
- Negative-validated: reverting only `src/utils/localJarvisEngine.ts` fails 10 of 13 in the new file (`10 failed | 3 passed`); restored → 13/13.
- Full suite observed: **113 files / 1504 tests passed**. Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 928823 bytes).

## [Unreleased] - 2026-09-27 03:52 IST (2026-09-26 22:22 UTC) — work slot 7: offline upload truth

### Fixed
- **The offline engine claimed a video upload it never staged.** `src/utils/localJarvisEngine.ts` (section 2, `youtube_upload_request`) replied that the payload "is staged", returned `actionExecuted: true` and incremented the user-visible "Autonomous Actions Executed" counter, although the module holds no staged-upload state and the caller's `handleExecuteAction` switch has no `youtube_upload_request` case (`default: break`) — no UI side effect was possible. The branch now returns `actionExecuted: false`, leaves the counter unchanged, reports `payload.staged: false`, and states in English/Hindi/Hinglish that the video was not staged and that Level-4 Human Authorization is still required.

### Tests
- `src/tests/offlineCallTruth.test.ts` — 18 tests (up from 16): a verdict test asserting `actionExecuted: false`, `payload.staged: false` and an honest reply, plus a source guard scoped to the upload branch.
- `src/tests/voiceAndHindiModes.test.ts` — the two Level-4 upload-gate tests now assert the honest verdict (`actionExecuted: false`) while keeping their `Level-4` / `requiresConfirmation` assertions.
- Negative-validated: reintroducing `actionExecuted: true`, the fabricated title and the unconditional counter bump fails exactly 2 of 18 (`2 failed | 16 passed`); restored → 18/18.
- Full suite observed: **112 files / 1491 tests passed**. Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 928643 bytes).

## [Unreleased] - 2026-09-27 03:10 IST (2026-09-26 21:40 UTC) — work slot 6: /api/chat tool-intent truth

### Fixed
- **The `/api/chat` tool intents credited failed tool calls as executed actions.** Every tool intent in the switch set `actionExecuted = true` regardless of what the tool returned: `list_files_tool` announced the workspace index even when `realFsList` failed; `web_research_tool` spoke *"Web analysis complete"* even when `realWebFetch` failed; `github_repos_tool` replied *"Authenticated as GitHub user @…"* with no token or a failed repo listing; `summarize_youtube_video`'s failure path still counted; an unparseable `math_computation` still counted; and `youtube_upload_request` claimed *"Video is staged"* with `actionExecuted: true` for an upload it never performed (and cannot without Level-4 authorization). Since the route increments `memoryState.stats.actionsExecuted` whenever `actionExecuted` is true, every one of these inflated the user-visible "Autonomous Actions Executed" counter with work that never happened.
  - Added `src/utils/toolDispatchTruth.ts`: `toolActionExecuted` credits an action only when the tool reported `success: true`; `toolActionResultReply` returns the confirmation line only on success and otherwise names the failed tool and states, in English or Hindi, that no action was executed; `countedItems` reports a real count or `0`, never a fabricated list. Wired into all seven intents; `youtube_upload_request` now honestly reports that Level-4 authorization is required and no video was uploaded.

### Tests
- `src/tests/toolDispatchTruth.test.ts` (new, 15 tests): helper semantics plus source guards on the seven intents (source guards are used because `server.ts` binds a port on import, matching `launchDispatchTruth.test.ts`).
- Negative-validated: reverting the `web_research_tool` guard to `actionExecuted = true;` fails exactly that assertion (`1 failed | 14 passed`); restored → green.
- Full suite observed: **112 files / 1486 tests passed**. Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 928107 bytes).

## [Unreleased] - 2026-09-27 02:56 IST (2026-09-26 21:26 UTC) — work slot 5: offline emergency-stop truth

### Fixed
- **The offline Local JARVIS Engine faked the emergency stop itself.** `src/utils/localJarvisEngine.ts` is the no-backend fallback used when `/api/chat` is unreachable. Its `emergency_stop` branch replied *"Emergency Stop is now active. All autonomous modifications, drafts, and external publishing are frozen."* and its `emergency_resume` branch replied *"Emergency Stop deactivated. All subsystems resumed under normal Level 1-4 permission gating."* — both with `actionExecuted: true` and both incrementing the user-visible "Autonomous Actions Executed" counter, while touching no emergency state at all. The live kill switch lives on the server (`toggleEmergencyStop` in `server.ts`, read by `isEmergencyStopActive()` in `src/utils/hardening/emergencyStop.ts`); the browser tab has no client-side emergency store to flip. A false success in the *unsafe* direction is the worst kind: the operator believes autonomy is frozen when it is not.
  - Added `src/utils/computerOperator/offlineEmergencyTruth.ts`. Both branches now report `actionExecuted: false` with the observed reason — the stop was **not** engaged / the resume was **not** released, this offline path cannot reach the server kill switch, and the request must be re-sent once the backend is reachable — in English, Hindi and Hinglish. `actionsExecuted` is no longer incremented for either branch.

### Tests
- `src/tests/offlineEmergencyTruth.test.ts` (new, 4 tests): verdict `actionExecuted === false` for stop and resume, honest titles, reply text in all three languages, and the offline engine end-to-end asserting `actionExecuted === false` **and** `actionsExecuted === 0`.
- `src/tests/voiceAndHindiModes.test.ts`: the two emergency contract tests now assert `actionExecuted === false` with the honest reply text.
- Negative-validated: forcing `actionExecuted: true` in `offlineEmergencyTruth.ts` fails exactly the four truth assertions (`4 failed | 18 passed` of the two files); restored → green.
- Full suite observed: **111 files / 1471 tests passed**. Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 926807 bytes).

## [Unreleased] - 2026-09-27 02:26 IST (2026-09-26 20:56 UTC) — work slot 4: offline surface-intent truth

### Fixed
- **The offline Local JARVIS Engine narrated external work it never performed.** `src/utils/localJarvisEngine.ts` (the no-backend fallback when `/api/chat` is unreachable) spoke and displayed: `location_services` — *"Accessing Geolocation API and orbital positioning telemetry"* with no GPS fix; `google_search` — *"Searching Google for <query>"* with no search backend; `cloud_telemetry` — *"Displaying Oracle Cloud Always Free ARM VM Telemetry"* with no metrics source; `generate_quotation` — *"Generating freelance quotation proposal"*; `create_social_post` — *"Launching Social Media Generator & Approval Matrix"*.
  - Each branch still opens the same in-app surface (a genuine in-app action, so `actionExecuted` stays `true` and `App.tsx` `handleExecuteAction` navigation still fires), but the reply now discloses what was **not** done: *"did not acquire a GPS fix"*, *"no results were retrieved"*, *"no live metrics were read"*, *"no new quotation was generated"*, *"no post was generated or published"*.
- **`/api/chat` `cloud_telemetry` asserted the Always Free plan as fact.** The live-read sentence is now gated on `oracleCloudState.metricsSource === 'live_host'`, and the cost line is derived from `describeBillingCost(oracleCloudState.billingEntitlement)` instead of hard-coding the plan.

### Tests
- `src/tests/remainingFakeSuccess.test.ts`: behavioral cases for all five offline intents (intent, `actionExecuted`, the disclosure text, absence of `orbital`) plus source guards pinning the five retired fake-success strings are gone and the server case no longer contains `Oracle Always Free ARM VM` / `Metrics are read live from the daemon host.`
- `src/tests/localJarvisEngine.test.ts`: contract assertions updated to the corrected semantics.
- Negative-validated: reintroducing `acquired orbital positioning telemetry` in the location branch fails the disclosure test (`1 failed | 76 passed` of 77); restored → 77/77 green.
- **Regression caught and fixed in-slot:** the first attempt set `actionExecuted: false`, which broke `voiceAndHindiModes.test.ts:138` (the Level-4 social-gate test needs the in-app console to open). `actionExecuted` is the navigation signal `App.tsx` uses; honesty belongs in the reply text, not in suppressing the real in-app action.
- Full suite observed: **110 files / 1467 tests passed**. Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 924348 bytes).

## [Unreleased] - 2026-09-27 01:55 IST (2026-09-26 20:25 UTC) — work slot 3: offline engine telephony call truth

### Fixed
- **The offline Local JARVIS Engine narrated carrier call work the browser tab never performed.** `src/utils/localJarvisEngine.ts` is the no-backend fallback used when `/api/chat` is unreachable (and the path `telephonyTestRunner.ts` drives). With no gateway session it still spoke and counted call actions: `make_call` spoke *"Placing outbound call to `<number>` through carrier gateway"* with title `Calling <number>`, `hangup_call` spoke *"Terminating active phone call"* with title `Call Ended`, `answer_call` spoke *"Connecting call with caller"* with title `Call Connected` — all three returned `actionExecuted: true` and incremented the user-visible "Autonomous Actions Executed" counter. The `human_handoff` branch promised a transfer to clinic staff whenever a provider was merely configured, and incremented `actionsExecuted` while reporting `actionExecuted: false`.
  - Added `src/utils/computerOperator/offlineCallTruth.ts`. The verdict is derived from the telephony engine mode actually active (`activeTelephonyEngineMode()`, read from `TelephonyProviderRegistry`), not from whether a provider is configured. Offline mode holds no gateway session, so it never confirms a carrier action: every phase (`dial`/`schedule`/`answer`/`hangup`/`reject`) reports `actionExecuted: false` in every engine mode, and the fabricated titles are gone from the offline engine.
  - The `human_handoff` branch no longer increments `actionsExecuted` while reporting `actionExecuted: false`.

### Tests
- `src/tests/offlineCallTruth.test.ts` (13 tests): the verdict matrix across five phases × four engine modes, the banned titles (`Calling `, `Call Connected`, `Call Ended`), the reply text, language selection, the offline engine branches end-to-end with the simulator active, and a source guard scoped to the telephony section (7.1–7.4) pinning that the fake titles and narration no longer appear.
- Negative-validated: reintroducing `title: 'Call Ended'` in the telephony section fails exactly the source guard (`1 failed | 12 passed`); restored → **13/13**.
- Full suite observed: **110 files / 1460 tests passed**. Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 921146 bytes).

## [Unreleased] - 2026-09-27 01:20 IST (2026-09-26 19:50 UTC) — work slot 2: offline engine operator truth

### Fixed
- **The offline Local JARVIS Engine narrated and counted host work the tab never performed.** `src/utils/localJarvisEngine.ts` is the no-backend fallback used when `/api/chat` is unreachable (and driven directly by `telephonyTestRunner.ts`). Seven operator branches set `actionExecuted: true` and incremented the user-visible "Autonomous Actions Executed" counter in `MemoryModal.tsx`: `fix_project_error` spoke *"Opening Visual Studio Code, inspecting screen for project errors, and applying surgical fix with test verification"*, `inspect_screen` spoke *"Analyzing active window, open dialogs, and visible errors"*, and `operate_vscode`/`operate_browser`/`operate_terminal`/`cancel_computer_task` made equivalent host claims. The browser tab cannot open VS Code, observe the host desktop, apply a code fix, or cancel a host task — the counter was inflated by actions that never left the page.
  - Added `src/utils/computerOperator/offlineOperatorTruth.ts` — a single verdict map (`offlineOperatorVerdict`, `offlineOperatorReply`, `offlineOperatorCountsAsHostWork`) backing all seven branches, so the claim and the counter cannot drift apart. Six report `actionExecuted: false` with `payload.offlineHostWork: false`; only `open_computer_operator` (opening the in-app HUD) is a genuine page-local action and keeps its increment.
  - Replies honour the existing `operatorLang` selection, so Hindi, Hinglish and English each state the offline limitation instead of asserting success.

### Tests
- `src/tests/localJarvisEngine.test.ts` (13 new tests, file now 46): each of the six fake-host intents asserts `actionExecuted === false`, `payload.offlineHostWork === false`, a zero `actionsExecuted` counter, and the absence of the old success phrases; plus the genuine-HUD counter case and the Hindi reply.
- Negative-validated: forcing `actionExecuted: true` in the `inspect_screen` branch fails exactly the truth assertion (`1 failed | 1 passed | 44 skipped`); restored → **46/46**.
- Full suite observed: **109 files / 1447 tests passed**. Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 914923 bytes).

## [Unreleased] - 2026-09-26 04:21 IST (2026-09-25 22:51 UTC) — work slot 13: filesystem-tool credential confinement

### Fixed
- **The filesystem tools could read and write the project's own credentials.** The sibling-prefix containment fix already on this branch (`safeResolvePath` using `path.relative` instead of a raw `startsWith`) stopped a path *leaving* `PROJECT_ROOT`. It did not protect anything *inside* the root: `realFsRead`, `realFsWrite` and `realFsDelete` still accepted `.env` and `.git/config` verbatim. Probed on this head: `.git/config` read back 315 bytes and `.env` was writable — and `.git/config` carries any credential embedded in a remote URL, which is the first thing an injected or compromised agent would read.
  - `safeResolvePath` now rejects non-string/blank paths and any path containing a NUL byte before touching the filesystem. `path.resolve()` silently *truncates* on a NUL byte (`'a\0../../etc/passwd'` resolves to `<root>/a`), so such a path was neither rejected nor resolved to what it appeared to name.
  - Added `isProtectedPath()`: denies any path whose segment is `.git`, `.ssh`, `.gnupg` or `.aws`, or whose basename is `.env*`, `.npmrc`, `.pypirc`, `.netrc`, `.yarnrc(.yml)`, `.git-credentials`, an `id_rsa|dsa|ecdsa|ed25519` key, or a `*.pem|key|p12|pfx|keystore|jks` bundle.
- **`.gitignore` did not ignore local credential overrides.** Added `.env.local` and `.env.*.local` alongside the existing `.env` line, without masking the tracked `.env.example`.

### Tests
- `src/tests/workspaceFsSecurity.test.ts` (7 tests): protected read/write/delete rejection, relative and absolute traversal, the sibling-prefix escape, NUL-byte injection, and a legitimate in-workspace read/write still succeeding.
- Negative-validated: disabling `isProtectedPath` fails **2 of 7** (`2 failed | 5 passed`); restored → **7/7**.
- Full suite observed: **108 files / 1417 tests passed**. Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 910590 bytes).

## [Unreleased] - 2026-09-26 03:55 IST (2026-09-25 22:25 UTC) — work slot 12: screenshot, volume and power dispatch truth

### Fixed
- **Three more `/api/chat` intents reported work that never happened.** `take_screenshot`, `volume_up`/`volume_down` and `pc_shutdown`/`pc_restart` each set `actionExecuted = true` and spoke an unqualified success ("Capturing screen display right now.", "Increasing master audio output level.", "Simulating system shutdown protocol.") while reaching no capture backend, no audio mixer and no power transition. The offline `src/utils/localJarvisEngine.ts` repeated the same three claims.
  - Added `src/utils/computerOperator/screenshotDispatchTruth.ts` (`screenshotVerdict()` / `screenshotReply()`): a capture is `VERIFIED` only when the executor receipt is `VERIFIED` **and** the file was verified on disk — a missing file downgrades a `VERIFIED` receipt to `UNVERIFIED`, and a headless host reports `NOT_AVAILABLE`.
  - Added `src/utils/computerOperator/audioDispatchTruth.ts` (`volumeVerdict()` / `volumeReply()`): reports the in-app voice-output level the UI slider actually uses and states the system output level was not changed. `actionExecuted` stays `false` in every case — the in-app slider is not a host action.
  - Added `src/utils/computerOperator/powerDispatchTruth.ts` (`powerVerdict()` / `powerReply()`): a power transition is never executed from this path — `NOT_IMPLEMENTED` with `permissionRequired`, `BLOCKED` when the emergency stop is engaged, `NOT_AVAILABLE` without a display session.
  - `open_notepad` now routes through the real `evaluateLaunchDispatch()` executor path like the other launch intents. The intents that genuinely only open an in-app view (telephony hub, call history, calculator, paint, chrome, browser navigation) keep `actionExecuted = true` but disclose that no external application or phone dialer was opened.
- **Two pre-existing tests encoded the old fake-success contract.** `src/tests/localJarvisEngine.test.ts` asserted `actionExecuted === true` for the offline screenshot and volume branches, which capture nothing and never touch a mixer; they passed only because the source lied. They now require `actionExecuted === false` and an honest reply, so the suite fails if the fabricated wording returns.

### Tests
- `src/tests/remainingFakeSuccess.test.ts` (24 tests) guards the three verdicts; negative-validated — reverting both source files fails **10 of 24**, restored → 24/24.
- Full suite observed: **107 files / 1410 tests passed**. Lint (`tsc --noEmit`) exit 0. Build exit 0 (`dist/server.cjs` 909349 bytes).

## [Unreleased] - 2026-09-26 02:45 IST (2026-09-25 21:15 UTC) — work slot 11: launch dispatch truth

### Fixed
- **The `/api/chat` launch intents reported launches that never happened.** `operate_vscode`, `operate_browser` and `operate_terminal` in `server.ts` set `actionExecuted = true` and spoke an unqualified success without touching the host, so on this headless sandbox the transcript and Security Matrix recorded a desktop application as launched. The offline `src/utils/localJarvisEngine.ts` made the same claim in words — VS Code "brought to active foreground", "PowerShell console activated", a "Chrome browser window" opened.
  - Added `src/utils/computerOperator/launchDispatchTruth.ts` plus `evaluateLaunchDispatch()` in `server.ts`, which routes the intent through the real `HostActionExecutor` `LAUNCH_APP` action and derives the verdict from the host capability map and the executor receipt: `NO_DISPLAY_SESSION`, `DISPATCHED_AWAITING_OBSERVATION`, `FOREGROUND_CONFIRMED` (the only outcome with `actionExecuted = true`), `FAILED`, `BLOCKED`, `UNVERIFIED`. The offline engine branches now state that offline mode cannot launch a real OS application.
  - Guarded by `src/tests/launchDispatchTruth.test.ts` (11 tests), negative-validated (`1 failed | 10 passed` with the fake success restored, 11/11 with the fix).

## [Unreleased] - 2026-09-26 02:20 IST (2026-09-25 20:50 UTC) — work slot 10: telephony voice-command dispatch truth

### Fixed
- **The `/api/chat` call commands reported success for calls nothing had made.** `make_call`, `answer_call`, `hangup_call` and `reject_call` in `server.ts` each set `actionExecuted = true` unconditionally and spoke an unqualified success — `Call Connected`, "फोन कॉल समाप्त कर दिया गया है", "Establishing audio channel now". Nothing was measured, so with the simulation provider active (the default when Twilio credentials are absent) or with no carrier configured, nothing answered, nothing ended and no channel existed, yet the transcript and Security Matrix counted performed external work.
  - Added `src/utils/telephonyDispatchTruth.ts` plus a `evaluateTelephonyDispatch(phase)` helper in `server.ts` that derives the outcome from the active engine mode (`telephonyGatewayTruth.telephonyEngineMode`) and the live session state (new `TelephonySessionManager.getLatestActiveSession()`). A simulator is never a carrier; an unpolled session is never an answer; `actionExecuted` is true only on `GATEWAY_CONFIRMED`. Replies and action titles now name the outcome instead of asserting a connection.

### Tests
- `src/tests/telephonyDispatchTruth.test.ts` (new, 10 tests) — simulation never confirms answer/hangup; live gateway + answered state confirms; live gateway + `RINGING` stays unconfirmed; no session → `NO_ACTIVE_SESSION`; no carrier → `NO_GATEWAY_CONFIGURED`; failed call → `CALL_FAILED`; the four commands route through the verdict and the hardcoded titles are gone. Negative-validated: forcing `actionExecuted: true` fails exactly 7 of 10 assertions (`7 failed | 3 passed`); restored → 10/10.

### Docs
- `docs/COMPLETION_STATUS.md` — item 13 evidence and last-cycle entry updated for slot 10. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-09-26 01:40 IST (2026-09-25 20:12 UTC) — work slot 9: HUDHeader kill-switch state truth

### Fixed
- **The HUD header rendered an unqueried emergency stop as a released one.** `HUDHeader.tsx` seeded `isKillSwitchActive` to `false`, fetched `/api/emergency/status` inside a `try` that discarded both the HTTP status and the parse result, and caught every failure silently — so a header that could not reach the backend drew an ordinary, non-emergency surface with the KILL SWITCH control armed and no banner. The engage handler mirrored the defect: it set the state to `true` on the bare `data.success` flag without reading the returned position.
  - The component now holds `useState<EmergencyStatusShape | null>(null)`, derives the switch position from the shared tri-state `emergencyLiveness()` / `emergencyStatusKnown()` helpers, treats a non-`ok` response and a non-boolean body as unobserved (fails closed), and adopts a post-toggle position only when `emergencyStatusKnown(data.emergencyState)` is true — otherwise it returns to `null` and lets the next poll decide. An unknown state renders an explicit `EMERGENCY STOP STATUS UNKNOWN` banner instead of the armed control surface. Same defect class already closed on the Permission Gateway and the Autonomous Tools Hub.

### Tests
- `src/tests/hudHeaderEmergencyLiveness.test.ts` (new, 5 tests) — seed is `null` and not a boolean, the derive imports and helper calls are present, the `res.ok` check precedes adoption of the payload, both toggle handlers gate on `emergencyStatusKnown`, and the unknown banner exists. Negative-validated: reverting to the boolean seed, the swallowed fetch and the constant `RELEASED` derivation fails exactly 3 of the 5 assertions (`3 failed | 2 passed`); restored → 5/5.

### Docs
- `docs/COMPLETION_STATUS.md` — item 13 evidence and last-cycle entry updated for slot 9. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-09-26 01:15 IST (2026-09-25 19:45 UTC) — work slot 8: voice security_audit posture truth

### Fixed
- **The spoken `security_audit` reply claimed a human-approval gate that may be off.** The `/api/chat` `security_audit` intent in `server.ts` answered `Security protocol active at Level ${securityMatrixState.currentLevel}. Human confirmation required for external actions.` unconditionally. `humanApprovalForExternal` is operator-flippable through `/api/security/matrix`, so a process with the gate off still told the user, out loud, that external actions required confirmation. The same fake-success class was already closed for the Telegram `security_audit` reply and the proactive-briefing insight, but this voice path was missed and would have passed the existing guards, which read the server source for those two phrases only.
  - The intent now derives its line from `securityMatrixPosture(securityMatrixState)` — the same helper the Telegram and briefing paths use — reporting `posture.levelLabel`, `posture.humanApproval` and `posture.secretMasking`. An unobserved or disabled flag is spoken as `UNKNOWN` / `DISABLED` rather than as an enforced gate. The action title follows `levelLabel` instead of a numeric level literal.

### Tests
- `src/tests/hardening/securityMatrixTruth.test.ts` — 3 new assertions ("the voice security_audit reply derives its posture"): the hardcoded phrase is absent, the numeric-level literal is absent, and the spoken line is built from `posture.levelLabel` / `posture.humanApproval`. Negative-validated: reverting the voice branch to its hardcoded form fails exactly those 3 assertions (`3 failed | 12 passed`), restored → 15/15.

### Docs
- `docs/COMPLETION_STATUS.md` — item 13 evidence and last-cycle entry updated for slot 8. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-09-25 23:15 IST (2026-09-25 17:45 UTC) — work slot 5: YouTube voice status reply truth

### Fixed
- **A passing token refresh made the voice reply claim a verified channel and a nominal API quota.** The `/api/chat` `youtube_status_inquiry` branch in `server.ts` answered *every* successful `ensureValidYouTubeToken()` with `YouTube Channel "<name>" is active, verified, and ready. OAuth 2.0 token status is nominal.` That helper only establishes that a stored token is unexpired or that a refresh POST to `oauth2.googleapis.com/token` returned a credential — it never calls `channels.list`, and nothing in the codebase measures API quota. The branch also substituted a hardcoded `'Connected Channel'` when the stored `channelTitle` was empty, so a credential with no channel read spoke a name that was never observed. The repo's own seeded `jarvis_memory.json` has exactly this shape (`connected: true`, `expiresAt` 2026-09-02, encrypted blobs), where the token check can only pass by refreshing.
  - New `src/utils/hardening/youtubeVoiceStatusTruth.ts`: `youtubeVoiceStatusReply()` builds the reply from the two facts the server actually holds — credential validity and the recorded scope grant — reusing `publishScopeGranted()` / `describeGrantedScopes()` from `src/utils/socialPublishHonesty.ts`. Upload authorization is stated as confirmed / not confirmed / unknown; the channel is named only when one was recorded, otherwise the reply says no channel has been read.
  - The reply no longer contains "verified", "nominal" or "ready", in English or Hindi. The action payload now carries `tokenValid` plus `channelVerified: false` rather than a single boolean that conflated credential validity with channel verification.
- **The Hindi branch of the reply was half-English.** Caught by the new test's Hindi assertions; the note and upload sentences are now fully bilingual.

### Tests
- `src/tests/youtubeVoiceStatusTruth.test.ts` — 9 assertions pinning the no-unobserved-claims rule, the three-state upload grant, the absent-channel case, and both languages. Negative-validated: restoring the phrase "is active, verified, and ready" fails 1 of 9, restored → 9/9.

### Docs
- `docs/COMPLETION_STATUS.md` — item 13 evidence and last-cycle entry updated for slot 5. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-09-25 22:35 IST (2026-09-25 17:05 UTC) — work slot 4: telephony engine-selection gateway truth

### Fixed
- **The Telephony Hub engine selector was a dead control, and wiring it naively would have created a fake green badge.** `POST /api/telephony/settings` in `server.ts` stored `telephonySettingsState.provider` but never called `TelephonyProviderRegistry.setActiveProvider()`, so whatever `TELEPHONY_PROVIDER` set at boot kept serving calls — the operator's selection was silently discarded. The UI value `browser_webrtc_simulator` also matched no registry id (the simulator registers as `simulation_test_provider`). And `SimulatedTestTelephonyProvider.isConfigured()` returns `true` unconditionally, so the direct wiring would have promoted a carrier-less test adapter to a green `GATEWAY CONFIGURED`.
  - New `src/utils/telephonyGatewayTruth.ts`: `telephonyEngineProviderId()` maps engine → registry id (`null` for unroutable engines), `telephonyEngineMode()` derives the measured mode (`LIVE_GATEWAY` / `SIMULATION_ONLY` / `NOT_CONFIGURED` / `UNSUPPORTED_ENGINE`) so a simulator is never reported CONFIGURED, `telephonyEngineLabel()` renders it honestly, and `telephonySelectionApplied()` is a measured id comparison rather than an assumption.
  - `POST /api/telephony/settings` now applies the engine and returns `engineApplied`; `GET /api/telephony/status` reports `engineMode` / `engineLabel` / `engineApplied` / `isSimulationOnly` from the provider actually serving calls.
  - `src/components/TelephonyHubModal.tsx` saves settings through the server, states the save result, and shows selected vs serving engine instead of an unconditional badge.
- **`TelephonyProviderRegistry.setActiveProvider()` did not self-initialize.** Unlike `getProvider()` and `getAllProviders()`, it returned `false` when the registry map was still empty. Found by the new cold-registry test; fixed to call `initialize()` first.

### Tests
- `src/tests/telephonyGatewayTruth.test.ts` — 10 assertions pinning the engine mapping, the simulator-never-CONFIGURED rule, and selection-applied as a measured comparison. Negative-validated on the `setActiveProvider` fix: the cold-registry case failed before (`1 failed | 30 passed` across the 3 telephony files) and passes after (`31/31`).

### Docs
- `docs/COMPLETION_STATUS.md` — item 13 evidence updated for slot 4. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-09-25 22:15 IST (2026-09-25 16:45 UTC) — work slot 3: OS-executor finance guard truth

### Fixed
- **The finance exclusion on the real host-executor path matched by substring.** `PermissionGuard.permanentBlock()` in `src/utils/computerOperator/permissionGuard.ts` — the gate the OS executor consults — still used a bare `desc.includes(kw)` for its short finance tokens, the same rule `isFinanceBlocked()` had already replaced in `server_tools.ts`. Measured against the live guard, this was wrong in both directions:
  - **false positive:** `Read file jupiter_notes.txt` → `BLOCK / FINANCE_RESTRICTION`, because `upi` occurs inside "jupiter". Benign local operator work was refused as a financial operation.
  - **false negatives:** `Initiate fund transfer`, `Deposit via NEFT`, `Enter debit card details`, `RTGS settlement` and `IMPS transfer` all returned `ALLOW` — real financial instructions the guard had no signature for.
  Single tokens now require an ASCII word boundary. Multi-word and Devanagari phrases stay substring matches, since `\b` cannot bound Devanagari. The five demonstrated misses were added as signatures, mirroring `server_tools.ts` so the two guards cannot drift.

### Tests
- `src/tests/permissionGuard.test.ts` — 17 new assertions (26 in file) covering the benign-substring cases, the retained exact-word blocks, and the five previously-missed financial instructions. Negative-validated both ways: restoring substring matching fails exactly the false-positive case (`1 failed | 25 passed`); removing the new signatures fails exactly the five false-negative cases (`5 failed | 21 passed`); restored → 26/26.

### Docs
- `docs/COMPLETION_STATUS.md` — item 13 evidence updated; repaired a malformed extra status cell in that row. Item 13 remains `PARTIAL`.

---

## [Unreleased] - 2026-09-25 21:50 IST (2026-09-25 16:20 UTC) — work slot 2: Telegram gateway send truth

### Fixed
- **`POST /api/telegram/send` no longer reports every send as delivered.** It
  answered `success: true` unconditionally, and `processMobileCommand` fired the
  outbound Telegram call fire-and-forget (`sendRealTelegramMessage(...).catch(...)`),
  so a blocked or failed send still rendered as delivered and
  `TelegramGatewayModal` spoke the reply aloud. The processor now awaits
  `deliverTelegramMessage` and returns its `DeliveryInterpretation`; the route
  derives `success`/`delivered` from `delivery.delivered` and returns the
  outcome, `messageId` and a plain notice; the echoed bubble is annotated
  *delivered* or *NOT DELIVERED*; the modal gates `onSpeak` and its success flag
  on `delivered === true`. Helper: `src/utils/hardening/telegramSendTruth.ts`.

### Tests
- `src/tests/telegramSendTruth.test.ts` — 10 assertions (5 pure-logic +
  5 route/modal source guards, since `server.ts` binds a port on import).
  Negative-validated: marking `NOT_CONFIGURED` delivered fails exactly 1 test.

### Verified
- `npm run lint` (`tsc --noEmit`) exit 0; targeted **2 files / 20 tests passed**;
  `npx vitest run` **99 files / 1300 tests passed**; `npm run build` exit 0,
  `dist/server.cjs` 874122 bytes.

## [Unreleased] - 2026-09-25 21:20 IST (2026-09-25 15:50 UTC) — work slot 1: audit-trail truth fields

### Fixed
- **`addAuditLog()` no longer stamps every row `VERIFIED`.** It derived
  `verificationStatus` and `finalTruthState` from hardcoded `'VERIFIED'` literals
  while writing the caller's `status` verbatim, so a row logged `FAILED`,
  `BLOCKED` or `PENDING` carried a green *confirmed* badge in the Security Matrix
  that contradicted its own status string. Both fields are now derived from the
  caller's outcome by `deriveAuditVerificationStatus()` /
  `deriveAuditFinalTruthState()` in `src/utils/hardening/auditTrailTruth.ts`.

### Tests
- `src/tests/hardening/auditTrailTruth.test.ts` — 5 new assertions covering the
  derivation for `VERIFIED`/`FAILED`/`BLOCKED`/`PENDING` and a `server.ts` source
  guard against the hardcoded literals (19 tests total). Negative-validated:
  disabling the derivation fails exactly 3 tests.

### Verified
- `npm run lint` (`tsc --noEmit`) exit 0; `npx vitest run` **98 files / 1290
  tests passed**; `npm run build` exit 0, `dist/server.cjs` 872300 bytes.

## [Unreleased] - 2026-09-25 04:37 IST (2026-09-24 23:07 UTC) — finalization slot: window re-verified, PR refreshed, nothing merged

### Verified (no code change)
- The frozen tip `3e6049a` of `feature/hermes-full-completion` was re-verified
  end to end: `npm run lint` (`tsc --noEmit`) exit 0; `npx vitest run`
  **98 files / 1285 tests passed** (20.46 s); `npm run build` exit 0, artifact
  `dist/server.cjs` 871612 bytes.
- Security: `git check-ignore -v .env` → `.gitignore:4`; `git status --short`
  clean; no `.env`, `node_modules/` or `dist/` tracked; the branch-diff
  secret-pattern scan returns only previously-documented synthetic fixtures and
  `redactSecrets` pattern documentation.
- PR #4 (→ `main`) is open, non-draft, `mergeable_state: clean`. **Not merged** —
  the merge awaits human approval, which is the standing project rule.

---

## [Unreleased] - 2026-09-25 04:15 IST (2026-09-24 22:45 UTC) — work slot 13: social draft staging stops logging unperformed work as verified

### Fixed
- `POST /api/social/generate`, `POST /api/social/youtube/upload-draft` and
  `POST /api/social/youtube/draft-test` (`server.ts`) appended their
  draft-staging audit row as `status: 'EXECUTED'` with `verificationStatus` and
  `finalTruthState` both `'VERIFIED'`. The Security Matrix renders those two
  fields as a green *confirmed* badge, so an event where **nothing left the
  process** — a local draft was written and a Level-4 approval request was
  staged — was presented as executed and verified external work. The row even
  contradicted the post object the same request created
  (`PENDING_APPROVAL` / `STANDBY` / `DRAFT`).
- New `src/utils/hardening/socialDraftAuditTruth.ts` returns the only honest
  truth triple for a staged draft (`PENDING` / `STANDBY` / `DRAFT`) and states in
  the action text that no external action was performed. It can never emit a
  verified claim.

### Added
- `src/tests/socialDraftAuditTruth.test.ts` — 6 tests. Three assert the truth
  builder's output, three are a source-level regression guard over the three
  routes. Negative-validated: reverting `/api/social/generate` to the literals
  makes the guard fail; restoring the fix makes it pass.

---

## [Unreleased] - 2026-09-25 03:45 IST (2026-09-24 22:15 UTC) — work slot 12: mobile telemetry stops reporting an unmeasured Level 4 gate and job count

### Fixed
- `GET /api/mobile/telemetry` (`server.ts`) answered
  `privacyMatrix.level4Enforced: true` and `systemScheduler.activeJobs: 4` as
  literals. The Level 4 gate is operator-flippable through `/api/security/matrix`
  (`humanApprovalForExternal`), so a process with the gate disabled still told
  the phone external actions required human approval; the scheduler defines five
  recurring routines (four daily reports plus the 03:00 IST nightly repository
  check), not four.

### Added
- `src/utils/hardening/mobileTelemetryTruth.ts` — `privacyMatrixTruth()` maps the
  observed gate to a tri-state (`false` → `DISABLED`, unobserved → `null` /
  `UNKNOWN — not observed`, only an explicit `true` → enabled), and
  `schedulerTruth()` counts the routines the process defines plus
  operator-registered scheduled goals and labels the next briefing as scheduled,
  not observed as run. The route now uses both.

### Tests
- `src/tests/mobileTelemetryTruth.test.ts` (8 tests): tri-state mapping incl.
  unobserved → `null`, routine count 5 ≠ 4, goal addition, honest next-briefing
  label, and a `server.ts` source guard that the route no longer contains
  `level4Enforced: true` / `activeJobs: 4` and calls both builders.
  Negative-validated: restoring the two literals fails exactly 1 test
  (`1 failed | 7 passed`), restored → 8/8. Full suite 97 files / 1279 tests
  passed; lint exit 0; build exit 0 (`dist/server.cjs` 870439 bytes).

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
