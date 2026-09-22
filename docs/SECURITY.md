# 🔒 Security & Authorization Architecture

## 1. Four-Tier Human Authorization Gateway (Level 1–4)

HERMES JARVIS enforces a strict 4-level permission policy across all subsystems:

```
[Level 1: Read-Only]      ──► System stats, time, diagnostics, git status (Autonomous)
[Level 2: Draft/Create]   ──► Create local notes, draft proposals, staging (Autonomous)
[Level 3: Modify State]   ──► Edit local files, update routines, switch modes (Human Awareness)
[Level 4: External Action]──► YouTube upload, Social publishing, Remote push (MANDATORY HUMAN GATE)
```

### Level 4 Invariant:
No external write, upload, or broadcasting action can occur without explicit human approval ("YES / APPROVE").

### Spoken-approval parsing (Android bridge)
The approval gate is only as strong as the parser that reads the owner's reply.
`evaluateOwnerApproval` in `src/utils/androidBridgeEngine.ts` previously returned
`APPROVE` for Hindi refusals — `कॉल मत उठाओ` ("don't answer the call"), `नहीं उठा`,
`मत उठा`, `कॉल नहीं उठाना` — because the bare Devanagari verb stem `उठा` was
listed as an approval keyword and Devanagari keywords matched with
`token.startsWith(keyword)`. A refusal could therefore satisfy the Level-4 gate.

The parser now: drops the ambiguous bare stem, requires whole-token equality for
Devanagari keywords (no prefix fallback), and evaluates rejection keywords before
approval keywords so a self-contradicting phrase resolves to `REJECT`. Pinned by
`src/tests/androidMobileBridge.test.ts`, negative-validated.

Anything that consumes an approval decision must treat `REJECT` and "no decision"
as distinct from `APPROVE`, and must never default to consent on an unparsed reply.

---

## 2. Strict Financial Exclusions Guard
- All financial, banking, crypto, and payment-related commands are blocked at the semantic parsing level.
- Any query attempting fund transfers, credit card charges, or wallet movements triggers the `FINANCE_SECURITY_GUARD` rejection response.
- This filter is exact-phrase based, so its coverage is only as good as its
  keyword list. On 2026-09-22 02:06 IST a real gap was found and closed:
  `isFinanceBlocked()` listed `'money transfer'` but not `'transfer money'`, so
  `isFinanceBlocked('transfer money to the client')` returned `blocked: false`
  and the same phrase passed the Computer Operator `PermissionGuard`
  (`src/utils/computerOperator/permissionGuard.ts`), which had dropped even
  `'money transfer'`. Both lists now include `'transfer money'`,
  `'transfer funds'`, `'send funds'`, `'move money'` and `'transfer rupees'`;
  `src/tests/financeGuard.test.ts` is the first direct coverage of the filter.
  A refusal here is permanent and never offers an approval path
  (`requiresHumanApproval` stays `false`, `dangerCategory`
  `FINANCE_RESTRICTION`) — a blocked finance action must be read as `BLOCKED`,
  never as `NEEDS_APPROVAL`.
- **The exclusion is now enforced where the action is actually dispatched.**
  On 2026-09-22 02:35 IST the executor with real side effects —
  `HostActionExecutor.execute()` (`src/utils/computerOperator/actionExecutorHost.ts`)
  — was found to contain no `PermissionGuard` call at all: it resolved the
  workspace path and then ran the command, so a `TERMINAL_COMMAND` whose text
  was financial reached the real shell. It also took a caller-supplied
  `approved` flag and lifted the Level-4 gate whenever it was set. A keyword
  list is only a guard if the code path that runs the action consults it.
  `PermissionGuard.permanentBlock()` is now the single owner of the
  never-permissible categories (emergency stop, finance exclusion, security
  bypass) and is called by both the browser-side `ActionExecutor.forwardToHost()`
  and `HostActionExecutor.safetyRefusal()`. `approved: true` cannot lift any of
  those; it only satisfies the ordinary Level-4 human gate. The kill-switch check
  in `server.ts` delegates to `isEmergencyStopActive()` too, so the HTTP layer
  and the executors share one definition of "the switch is engaged".
  Covered by the `HostActionExecutor — Level-4 safety gate` block in
  `src/tests/hostActionExecutor.test.ts`; negative-validated (disabling the gate
  fails 5 of 6 new cases).

---

## 3. Global Kill Switch Protocol
- Emergency stop triggers can be issued via voice (`"emergency stop"`, `"जार्विस तुरंत सब बंद करो"`), UI button, or Telegram command (`/stop`, `/emergency_stop`).
- Upon activation:
  - All background polling and scheduled tasks are frozen.
  - Active network broadcasts are terminated.
  - Subsystems enter a safe, read-only standby state until explicitly unpaused via Level 4 authorization (`/resume`).

**Liveness is tri-state, never a default.** A kill-switch surface may not read
"released" for a state it never observed. `src/utils/emergencyTruth.ts` is the
single source of truth: `emergencyLiveness()` returns `ACTIVE` only for an
observed `emergencyPaused: false`, `ENGAGED` when the pause or hard switch is
set, and `UNKNOWN` for `null`, `undefined`, or a status lacking a real boolean.
Both human-facing control surfaces seed `null` and fail closed while the status
is unknown: `PermissionGateway.tsx` blocks approval, and
`AutonomousToolsModal.tsx` disables its Level-3 workspace-write and
issue-queue controls via `actionBlocked = loading || emergencyPaused ||
!statusKnown`. Neither component reads the raw `emergencyPaused` flag on any
render path. Guards: `src/tests/permissionGatewayEmergencyLiveness.test.ts` and
`src/tests/autonomousToolsEmergencyLiveness.test.ts`.

---

## 4. Permission Matrix (implemented)

`src/utils/hardening/permissionMatrix.ts` is the single source of truth for what
an action may do and who must approve it. `POST /api/security/evaluate` exposes a
dry run.

Entries are ordered most-restricted-first, and the **first match wins**. A
command containing both `read` and `delete` therefore classifies as destructive,
never as a read. The alternative — scanning for the most permissive match —
turns any compound command into an approval bypass.

An action that matches no entry is **not** treated as safe. It is refused at
level 4 with `requiresApproval: true`, category `unknown`. An unrecognised
capability must be added to the matrix deliberately before it can run.

Approval requires a named approver. The values `system`, `auto`, `anonymous`,
`unknown` and the empty string are rejected: an automated or unlabelled
`approved: true` is not a human decision.

## 5. Kill switch precedence

`POST /api/security/evaluate` checks the emergency stop **before** the level
check. While the switch is engaged, every action is refused with category
`kill_switch` — including a level-1 read. Safety controls that can be reasoned
around by lowering the requested action's risk are not controls.

## 6. Secret handling

`redactSecrets` in `credentialRedactor.ts` masks credentials in any text that
leaves the system.

### Where redaction is applied

Redaction only helps if it sits on the path the secret actually takes. The
redactor was wired into the computer-operator output and the backup snapshot,
but not into the path that ships memory to a third-party model.
`assembleAiContext()` in `src/utils/memory/aiContext.ts` builds the Gemini system
prompt from the assistant name, custom key/values, note titles and bodies, and
the conversation history. Until 2026-09-22 18:43 UTC it inserted all of that
verbatim, so a GitHub token stored in long-term memory, an API key saved as a
custom fact, or a password typed in chat was sent to Google in the
`generateContent` request body.

Every outbound string in that path now passes through `auditSecrets()` before it
is assembled, and the result reports `redactedSecretsCount` and
`redactedCategories`. The `/api/chat` call site passes the observed
`securityMatrixState.credentialLeakProtection` flag and logs a warning naming the
categories whenever a redaction occurs, so a scrub leaves a trace instead of
being silent. The opt-out (`redactCredentials: false`) exists for tests only and
is never set by the server. Guarded by `src/tests/llmContextLeakProtection.test.ts`
(7 tests); negative-validated — forcing the guard off fails 4 of 7.

The Security Matrix modal previously rendered `Zero Credential Leaks to LLM
Memory — PROTECTED` as a hardcoded literal while `credentialLeakProtection` had
no reader anywhere. The badge is now derived from observed state
(`PROTECTED` / `DISABLED` / `UNKNOWN`); see section 9 on liveness claims.

Two patterns were found to be broken and were fixed:

- The OpenAI pattern contained a stray `T3BlbkFJ` fragment inside a quantifier,
  so it matched no key of any kind. It also carried a bare `[a-zA-Z0-9]{48,}`
  alternative that redacted ordinary commit hashes. Both were removed.
- The Telegram pattern began with `\b`, which cannot match after `bot` in
  `https://api.telegram.org/bot<token>` — the only realistic location of a bot
  token. Replaced with a `(?<![0-9])` lookbehind.

A later cycle ran a live probe over common token families and found five more
that `redactSecrets` left untouched: Stripe secret/restricted keys
(`sk_live_`/`rk_test_`), Slack tokens (`xoxb-`/`xoxp-`), npm tokens (`npm_`),
Hugging Face tokens (`hf_`), and SendGrid keys (`SG.<22>.<43>`). Patterns for all
five are now applied, with six regression tests. A Twilio account SID (`AC`+32
hex) is intentionally **not** redacted: it is a public account identifier, and
masking it would only corrupt legitimate logs. The rotate-able Twilio auth token
is the secret and is caught by the generic credential patterns.

A second probe (2026-09-20) found six further families that `redactSecrets` left
untouched, all now covered:

- Google OAuth client secrets (`GOCSPX-…`) and Discord bot tokens
  (`<id>.<timestamp>.<hmac>`).
- GitLab access tokens (`glpat-`) and DigitalOcean personal access tokens
  (`dop_v1_` + 64 hex).
- Labelled AWS secret access keys. These have no fixed prefix, so the pattern is
  anchored on the `aws_secret_access_key` / `secret_access_key` label; matching a
  bare 40-character blob would redact ordinary output.
- Passwords inside database connection strings
  (`scheme://user:password@host`). This rule uses a `replacer` hook so only the
  password is masked and the scheme, user and host remain readable in a log. The
  Discord-shaped pattern is guarded by a test that ordinary dotted prose such as
  `node 20.11.0` and versioned URLs are not over-redacted.

`src/tests/credentialRedactor.test.ts` now has 22 tests; 7 were added by this
probe. Six of those seven fail against the previous pattern set, and the seventh
is a guard against over-redaction. Negative-validated: reverting only the source
fix fails exactly those 6.

`.gitignore` must contain a `.env` line and must be UTF-8. The committed file was
UTF-16, so git honoured none of it; `git check-ignore .env` confirms the current
file works.

### Caller-ID masking

Masking is a privacy control, so it must be consistent wherever a number is
logged or rendered. Two independent `maskPhoneNumber` implementations existed.
The helper in `src/utils/androidBridgeEngine.ts` correctly produced
`+91 ******3210`; the one in `src/utils/telephonyPermissions.ts` produced
`+9198765*****`, exposing the country code plus eight of the ten subscriber
digits. The telephony helper now matches the bridge helper, hiding everything
except the country prefix and the last four digits; blank input returns
`Unknown / Private` and input with ≤4 digits returns
`****`. Guarded by `src/tests/telephonyPermissions.test.ts` (24 tests).

The token vault no longer carries a hardcoded fallback key. Without
`APP_SECRET`/`SESSION_SECRET` it reports `NOT_CONFIGURED` and encrypts under a
random per-process key, so tokens do not survive a restart but are never
protected by a key that is public in the repository.

**Update 2026-09-22 21:35 IST — the bridge helper itself had a defect.** The
description above treated `androidBridgeEngine.ts` as the canonical good mask,
but it was only good for numbers that start with `+`. It sliced the last four
*characters* of its input without checking that the input held digits, so a
digit-free caller label came back as a fragment of itself (`'Unknown'` →
`'******nown'`, `'private'` → `'******vate'`) — a leaked label element presented
in phone-number shape. That is the live path: the route calls
`maskPhoneNumber(payload.callerNumber || 'Unknown')` when the bridge reports a
call with no resolvable number. A real spaced number was also mis-rendered:
`'+1 415 890 2134'` became `'+1  ******2134'` (double space) because the prefix
was `slice(0, 3)` and an extra space was appended. `maskPhoneNumber` now
extracts the digits first: a digit-free input returns `'Unknown Number'`, and a
real number keeps its matched `+<area> ` prefix and the last four digits, with
spacing normalised (`'+91-9876543210'` → `'+91 ******3210'`). Guarded by
`src/tests/androidMobileBridge.test.ts` Scenarios 19–20; negative-validated
(`2 failed | 37 passed` with the pre-fix body restored). `telephonyPermissions.ts`
never shared the digit-free defect — it already returns `'Unknown / Private'`.

## 7. Secret audit

`GET /api/security/audit-secrets` scans tracked text files. It deliberately flags
only quoted literal assignments and unmistakable token shapes. A broader version
reused the redaction patterns and reported 100 "credentials" in `server.ts`,
every one a reference such as `conn.accessToken = decrypted`; that volume of
noise is indistinguishable from having no audit at all.

Test-file fixtures are reported at LOW rather than CRITICAL, since a signing
secret in a test is not a production leak.

The audit is a pattern scan. A clean result means those patterns were absent, not
that the system is secure. No third-party penetration test has been performed.

## 8. Backup, restore and deployment

- `GET /api/backup` returns a snapshot only if it passes its own round-trip
  verification; otherwise it returns HTTP 500.
- Credentials are redacted before a snapshot leaves, and prototype-polluting keys
  are dropped.
- `POST /api/restore` preserves keys the backup does not mention, so restoring an
  old snapshot never silently erases newer data.
- `GET /api/deployment/verify` reports the conditions a deployment must satisfy.
  An `UNKNOWN` check blocks readiness rather than being assumed good: an
  unexercised backup is not evidence that backups work.

## 9. Liveness claims on outbound integration surfaces

An integration panel that displays a credential or a connection state is a
security surface of its own: an operator reads it before deciding whether to trust
a path with a message or a command. A panel must therefore never render a
connection, a bot handle, a host or a replication path that no code path observed.

The Telegram gateway is the reference implementation of this rule.
`server.ts` seeds `telegramConfig.botUsername` to a template handle and sets
`botUsernameReported = true` only after a successful `getMe`; it seeds
`totalMessagesReceived` at `0` rather than a plausible baseline.
`src/utils/telegramGatewayTruth.ts` turns the status response into a tri-state
(`LIVE` / `NOT_LIVE` / `UNKNOWN`) so a failed or not-yet-issued request renders
`STATUS UNKNOWN` and cannot be read as either confirmed-live or confirmed-offline.
`TelegramGatewayModal.tsx` seeds `statusKnown = false` and keeps the server config
only when `telegramStatusKnown(data.config)` is a real boolean.

This is the same invariant enforced on the Permission Gateway and the Autonomous
Tools Hub emergency badge (`src/utils/emergencyTruth.ts`): a security-relevant
state that has not been observed is `UNKNOWN`, and `UNKNOWN` never enables an
action. Guarded by `src/tests/telegramGatewayTruth.test.ts` (12 tests, including
source guards that pin the absence of the hardcoded claims).
