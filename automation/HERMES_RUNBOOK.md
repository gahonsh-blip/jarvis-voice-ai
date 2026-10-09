# HERMES automation runbook

Operational notes for the two HERMES JARVIS automations. These run **outside**
the repository; this file is the durable record so a failed run can be triaged
without re-discovering the environment.

| Automation | Schedule (IST) | Prompt file | Entrypoint |
| :--- | :--- | :--- | :--- |
| HERMES JARVIS Nightly Continuation Engineer | `30 23 * * *` | `automation/hermes-nightly-prompt.md` | `.venv/bin/python main.py` |
| HERMES JARVIS Autonomous Nightly Window | `05,35 21-23,0-4 * * *` | `automation/hermes-autonomous-window-prompt.md` | `.venv/bin/python main.py` |

Both are created with the `preset/prompt` endpoint, so the platform generates the
entrypoint wrapper; there is no `main.py` or `setup.sh` in this repository. The
target repo is `gahonsh-blip/jarvis-voice-ai`, cloned at run start into
`/workspace/project/jarvis-voice-ai`.

- Deploy the window automation: `automation/deploy-hermes-window.sh`
- Deploy the continuation automation: `automation/deploy-hermes-continuation.sh`
- Both support `--dry-run` (prints the body it would POST, no API call).

The platform gives each run a hard cap (`timeout`, 1800 s). A `PATCH` on an
existing automation can change the schedule but **not** the prompt — the prompt
lives in the uploaded tarball. To change the prompt you must DELETE the
automation and re-create it from the script.

## Why runs fail, and what to do

Runs fail for reasons that are almost never a defect in this repository. The
observed classes, with the correct response:

1. **LLM gateway outage.** `OpenAIError: <!DOCTYPE html> ... Service Temporarily
   Unavailable` (HTTP 503 from `llm-proxy.app.all-hands.dev`) crashes the
   conversation mid-run. This is upstream; there is nothing to fix in the repo.
   The SDK's configured retries (`num_retries: 5`, exponential) usually absorb a
   brief blip. If it recurs often, switch the automation's model profile or
   report the outage to OpenHands support. See
   `https://statuspage.incident.io/openhands`.

2. **Run killed at the platform cap.** The run ran the full 1800 s without
   finishing, so no report survived. Prevention is the prompt's rule 8: start
   `npm ci`, `git push` and any network step under `timeout`, keep the report
   written *before* the push, and never let the budget equal the cap. The report
   is the deliverable; a partial honest report is a success.

3. **Sandbox not ready.** `Sandbox ... not ready after 300s`
   (`get_execution_context`). The run never started; there is nothing in the git
   history to audit. It was most acute when many automations fired the same
   minute — see *Scheduling* below.

4. **Push / credential hang.** The clone's `origin` has no credentials, so a
   bare `git push` can block. Always set the remote with the injected token and
   time-box it:

   ```bash
   git remote set-url origin "https://x-access-token:${GITHUB_TOKEN}@github.com/gahonsh-blip/jarvis-voice-ai.git"
   timeout 90 git push -u origin feature/hermes-full-completion
   ```

## Scheduling

Several automations in this account fire in the same minute, which makes a
concurrent sandbox-start failure more likely. This account has historically
overlapped:

- `30 23 * * *` — HERMES JARVIS Nightly Continuation Engineer (this repo)
- `0,30 21-23,0-4 * * *` — Arunalaya Nightly Deep-Development Engineer
- `05,35 21-23,0-4 * * *` — HERMES JARVIS Autonomous Nightly Window (this repo)
- `30 22 * * *` — Cross-Repo Nightly Developer
- `15 19 * * *` — Gahonsh Finance Feature Implementer

Staggering the minutes (e.g. moving the continuation engineer to `:40`) reduces
collisions but is a human decision.

## CI

`.github/workflows/ci.yml` (`typecheck · tests · build`) is the repo's own gate
and is independent of these automations. It has been reported RED for
infrastructure only — the account is locked for a billing issue so jobs never
start. That is not a code failure; the automation reports it as such.

## Local reproduction of a night's work

```bash
git clone "https://x-access-token:${GITHUB_TOKEN}@github.com/gahonsh-blip/jarvis-voice-ai.git" /tmp/jarvis
cd /tmp/jarvis
npm ci                 # ~1 min
npm run lint           # tsc --noEmit, ~7 s
npx vitest run         # full suite, ~60 s
npm run build          # ~4 s, emits dist/server.cjs
```
