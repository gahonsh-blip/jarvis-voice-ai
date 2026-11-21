# Permissions — the consent layer

Jarvis asks before it acts, the way a phone app asks for the folder, the mic or
the call log. The question is asked once per capability, the answer is stored on
disk, and the check runs inside `executeTool` **before** any tool code, so no
prompt can talk its way past it.

State file: `${AGENT_STATE_DIR:-~/.jarvis}/permissions.json` — one small JSON
file, so this works offline and survives restarts.

## Capabilities

| Capability | Asked as | Risk | Granted on a fresh install |
| --- | --- | --- | --- |
| `files.read` | Read files inside the workspace | low | yes |
| `memory` | Keep notes and memories between tasks | low | yes |
| `files.write` | Create or change files in the workspace | medium | no |
| `shell` | Run shell commands and skills on this device | high | no |
| `network` | Search the web, open pages and call APIs | medium | no |
| `messages` | Send email, WhatsApp or chat messages as you | high | no |
| `calls` | Place or answer phone calls | high | no |
| `publish` | Post, deploy or change a live app or site | high | no |
| `payments` | Start a checkout or spend money | high | no |
| `platform` | Use the Base44 platform tools | medium | no |

Reading and remembering are on by default because the agent cannot answer a
question without them. Everything that writes, runs, spends, publishes or
contacts someone is off until the owner says yes.

`ask_clarifying_questions` needs no permission at all: it only formats text.

## What the owner sees

A blocked call returns a question, not a crash:

```
permission_required: Run shell commands and skills on this device (tool: bash).
Allow? Reply "allow shell" or POST /permissions/grant.
```

Each ask is queued once in `pending`, so a repeated attempt does not spam the
owner with duplicates.

## API

```bash
GET  /permissions                    # every capability + granted state + pending queue
POST /permissions/grant              # {"capability":"shell"}
POST /permissions/revoke             # {"capability":"shell"}
GET  /permissions/capability/bash    # which capability a tool needs
```

Granting is immediate and permanent until revoked; revoking puts the question
back. An unknown capability is rejected, never silently granted.

## Offline mode

`AGENT_OFFLINE=1` makes the agent usable with no internet and no key:

- `network`, `platform`, `calls`, `messages` and `publish` tools answer
  `offline_mode: <tool> needs the internet and AGENT_OFFLINE=1 is set`.
- Files, shell, memory, personas and the agent loop keep working.

The 76 Base44 bridge tools and the 2 key tools stay honest offline: they answer
`not_configured` and name the variable they need instead of pretending.

## Why the check lives in executeTool

A persona changes the voice, never the rules. Putting the consent check in the
one function every tool call passes through means a new persona, a new tool or a
new provider cannot skip it.
