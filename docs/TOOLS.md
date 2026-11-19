# Jarvis tools — what runs, and where

Every tool below is executed on the server, not in the browser. The live proof is
one request: `GET /api/agent/selftest` returns a pass/fail line per tool with its
measured latency, so "it works" is never a screenshot.

## Host reality

The public demo runs as a Vercel function. That host has no `git` binary and its
filesystem is a scratch `/tmp`, so two tools behave differently there than on a
VM. Both say so in their output instead of failing silently.

| Tool | What it does | Notes |
| --- | --- | --- |
| list_files | List a directory inside the workspace | |
| read_file | Read a text file | |
| write_file | Create or overwrite a file | needs approval |
| grep_files | Search file contents | |
| run_command | Run a shell command | needs approval, allow-listed |
| fetch_url | Download a page as text | |
| web_search | Search the web free | DuckDuckGo html -> lite -> instant answer -> Wikipedia |
| git | status/diff/log/commit/push | Vercel has no git; use a VM or `http_request` to the GitHub API |
| remember / recall | Agent memory in the workspace | |
| time_now | UTC and IST clock | |
| http_request | Any HTTPS API call | |
| hash_text | SHA-256 hex | |
| json_get | Read a dotted path out of JSON | |
| memory_set / memory_get | Durable key/value notes | |

## Keys that are not wired yet

These need a credential before they can do anything real. The agent reports the
missing variable rather than pretending:

- Gmail read/send: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, refresh token
- GitHub private repos: `GITHUB_TOKEN`
- Phone calls: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
- WhatsApp send: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`
- Persistent storage and a real `git`: run `deploy/quickstart.sh` on an Oracle Always Free VM

## Self-test

```bash
curl https://jarvis-super-agent.vercel.app/api/agent/selftest
```

Latest run on this host: 16 tools, 14 passing. `web_search` and `git` are the two
host-limited ones, both documented above.
