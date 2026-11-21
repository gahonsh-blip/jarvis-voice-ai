# All 87 Base44 tools -> what Jarvis actually runs

The owner's list is 87 tools. Jarvis is a plain Node server, Base44 is a
platform, and a tool cannot be "copied" across that boundary. So the 87 names are
all registered here, and every one of them is honest about which of three things
it is:

| Bucket | Count | What it means |
| --- | --- | --- |
| **NATIVE** | 9 | Really runs on this host, no key needed. |
| **BRIDGE** | 76 | Calls the Base44 bridge (`BASE44_API_URL` + `BASE44_API_KEY` + `BASE44_AGENT_ID`). Without them it answers `not_configured` and names the missing variable. |
| **KEY** | 2 | Runs here, needs `OPENAI_API_KEY` (`generate_image`, `transcribe_audio`). |

Proof, not a screenshot:

```bash
curl https://<host>/api/agent/tools     # count: 87 + per-bucket totals + schemas
curl https://<host>/api/agent/selftest  # native tools run for real, bridge/key report their state
npm test -- src/tests/toolParity.test.ts # pins 87 names, counts and honest failures
```

## Native (9) — really run here

| # | Tool | Notes |
| --- | --- | --- |
| 1 | read_file | jailed inside `AGENT_WORKSPACE_ROOT` |
| 2 | write_file | dangerous, needs approval |
| 3 | grep | same engine as the old `grep_files` |
| 4 | bash | allow-listed, dangerous, needs approval |
| 5 | web_search | DuckDuckGo -> lite -> instant answer -> Wikipedia |
| 6 | save_memory | durable key/value notes |
| 7 | search_previous_messages | same engine as the old `recall` |
| 8 | run_skill | executes `.agents/skills/<name>` (run.sh / run.py / run.js) |
| 9 | ask_clarifying_questions | no widget on a server host, so it returns the questions to ask in plain text |

## Bridge (76) — the platform half

Files and code (1): `run_skill` is native, so this bucket is the rest of the
list. Memory (5): `forget_memory`, `update_identity`, `list_sessions`,
`read_session_log`, `search_sessions`. Internet (15): every `browserbase_*` tool
plus `browser_confirm_payment`. Media (4): `upload_file`, `upload_private_file`,
`create_file_signed_url`, `send_image`. Connectors (6). Automation and goals (8).
Backend functions (5). Database (6). Base44 apps (4). Messaging and calls (7).
Settings and chat (8): everything except `ask_clarifying_questions`. Proactive
delivery (4). Sub-agents (4).

The bridge contract is one POST:

```json
{ "agent_id": "<BASE44_AGENT_ID>", "tool": "read_entities", "arguments": { "entity_name": "Booking" } }
```

to `BASE44_API_URL` + `BASE44_BRIDGE_PATH` (default `/api/tools/invoke`) with
`Authorization: Bearer <BASE44_API_KEY>`. The response body is returned to the
model as the tool output.

## Key (2)

| Tool | Variable | Behaviour without it |
| --- | --- | --- |
| generate_image | `OPENAI_API_KEY` | `not_configured: generate_image needs OPENAI_API_KEY` |
| transcribe_audio | `OPENAI_API_KEY` | same, naming the variable |

## Old names still work

`grep_files`, `run_command`, `memory_set`, `recall`, `list_files`, `fetch_url`,
`git`, `http_request`, `hash_text`, `json_get`, `memory_get`, `remember`,
`time_now` are not part of the 87, so they are no longer advertised to the model,
but `findTool()` still resolves them as aliases. Nothing that already worked
broke.

## What changed from the previous 67-tool map

The earlier version of this file said 16 tools were built and the rest "cannot be
copied". That was true but it left the owner without the surface he asked for.
Now all 87 exist, the 76 platform tools are reachable the moment the bridge keys
are set, and the two that need a provider key say exactly which one.
