# HERMES JARVIS as a Super-Agent

This module turns JARVIS from a voice assistant that depends on one API key into a
self-contained agent that can plan, use tools and finish work on your own machine,
even when a hosted assistant's credits are gone.

## What it adds

| Capability | How it works |
| --- | --- |
| Never dies on one quota | `src/agent/providers.ts` walks `AGENT_PROVIDER_ORDER` (Gemini, Groq, OpenRouter, Cerebras, DeepSeek, local Ollama). A failing provider cools down and the next answers. |
| Real tools | `src/agent/tools.ts`: list/read/write files, grep, run shell, fetch URLs, free web search, git status/diff/commit/push, durable memory. |
| Agent loop | `src/agent/loop.ts`: plan, call tools, read results, verify, answer. Native tool calling where supported, strict JSON protocol where it is not. |
| Safety rails | Path jail inside `AGENT_WORKSPACE_ROOT`, destructive command blocklist, approval gate for writes, commands and pushes. |
| Three ways to use it | Web API (`/api/agent/*`), terminal (`npm run agent`), and the existing dashboard. |
| Transferred knowledge | `agent-skills/` playbooks: deploy, Supabase, repo audits, freelance profiles, lead outreach, client delivery. |

## 1. Configure the models (all free tiers)

```bash
cp .env.example .env
```

Add at least one key. Recommended order for a zero-cost setup:

1. `GEMINI_API_KEY` - https://aistudio.google.com/apikey (free daily quota)
2. `GROQ_API_KEY` - https://console.groq.com/keys (free, very fast)
3. `OPENROUTER_API_KEY` - https://openrouter.ai/keys (choose a `:free` model)
4. `CEREBRAS_API_KEY` - https://cloud.cerebras.ai (free tier)
5. Ollama, fully offline and free: `curl -fsSL https://ollama.com/install.sh | sh && ollama pull qwen2.5-coder:7b`

Check what is live:

```bash
npm run agent:status
```

## 2. Use it from the terminal

```bash
npm run agent                                  # interactive
npm run agent -- "why is the build failing in this repo?"        # read-only
npm run agent -- --approve "fix the failing test and commit it"  # may write and run
```

Read-only by default: the agent can inspect everything but cannot change files or
run commands until you pass `--approve`. Push and pull always need the approval flag.

## 3. Use it over HTTP

```bash
curl -s localhost:3000/api/agent/status

curl -s localhost:3000/api/agent/run \
  -H 'content-type: application/json' \
  -d '{"task":"summarise what server.ts does","approved":false}'

curl -N localhost:3000/api/agent/stream \
  -H 'content-type: application/json' \
  -d '{"task":"run the test suite and report failures","approved":true}'
```

If the daemon is reachable from the internet, set `AGENT_API_TOKEN` and send it as
`x-agent-token`. Without the token the routes are open, which is fine on localhost only.

## 4. Safety model

- Every path is resolved inside `AGENT_WORKSPACE_ROOT`. `../../etc/passwd` throws `path_outside_workspace`.
- Blocked outright: recursive delete of `/`, `mkfs`, `dd if=`, shutdown/reboot, fork bombs, `sudo`, piping a remote script into a shell, `git push --force`.
- `write_file`, `run_command`, `git push`, `git pull` return `approval_required` until the run is approved.
- Identical tool calls are skipped after two repeats, so a confused model cannot spin forever.
- The loop hard-stops at `maxSteps` (default 12, max 30).

## 5. Playbooks

`agent-skills/*.md` holds the operational knowledge: how to deploy to Vercel and prove
it, Supabase SQL and cron gotchas, auditing every repository, marketplace pricing,
compliant lead outreach, and client handover. The system prompt tells the agent to read
the matching file before starting that kind of task. Add a playbook whenever a task
teaches you something reusable.

## 6. Tests

```bash
npx vitest run src/tests/superAgent.test.ts
npx tsc --noEmit
```

The suite covers: native tool round-trip, JSON-protocol round-trip, fallback when the
first provider returns 429, `no_model_available`, path jail, command blocklist, approval
gate, write-when-approved, repeat-call protection and the DuckDuckGo parser.

## 7. Cost reality

| Path | Cost |
| --- | --- |
| Gemini / Groq / Cerebras / OpenRouter `:free` | 0, daily quota limits only |
| Ollama on your own machine | 0, no quota, needs ~5 GB disk and 8 GB RAM |
| DeepSeek | paid per token, cheapest paid fallback |

With Gemini plus Groq plus Ollama configured, the free quotas of three providers have
to be exhausted on the same day before the agent stops, and Ollama has no quota at all.

## 8. Running it 24/7 (free)

Two supported ways, both cost 0:

**Docker, any small VPS or your own PC**

```bash
docker build -t hermes-jarvis .
docker run -d --name jarvis -p 3000:3000 --env-file .env -v $HOME/work:/workspace hermes-jarvis
```

`/workspace` is the folder the agent may read and change. Mount the projects you
want it to work on, nothing else.

**Ubuntu box, Oracle Cloud Always Free ARM (4 OCPU / 24 GB) is enough**

```bash
git clone https://github.com/gahonsh-blip/jarvis-voice-ai.git && cd jarvis-voice-ai
bash deploy/quickstart.sh     # installs node, builds, starts under pm2
```

`quickstart.sh` creates `.env` on the first run and stops so you can paste a free
key, then re-running it builds, checks the providers and starts the daemon under pm2.
Add `pm2 startup` once so it survives a reboot.

Keep `/api/agent/*` off the public internet unless `AGENT_API_TOKEN` is set; the
routes can write files and run commands on that machine.
