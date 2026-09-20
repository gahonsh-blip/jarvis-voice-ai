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
