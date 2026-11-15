#!/usr/bin/env bash
# Create (or re-create) the HERMES JARVIS Nightly Continuation Engineer automation.
#
# Usage:
#   OPENHANDS_API_KEY=... ./automation/deploy-hermes-continuation.sh --dry-run
#   OPENHANDS_API_KEY=... ./automation/deploy-hermes-continuation.sh
#
# This automation fires once a night (23:30 IST) and advances one backlog item.
# The platform caps a single run at 1800 s; the prompt's schedule leaves a margin
# inside that cap so the report is always written (see automation/HERMES_RUNBOOK.md).
#
# POLICY: the automation NEVER merges to main. It commits and pushes only
# feature/hermes-full-completion.
#
# Note: PATCH on an existing automation can change name/trigger/enabled/timeout
# but NOT the prompt. To change the prompt, DELETE the automation first (see the
# id below) and re-run this script; the platform assigns a new id.
set -euo pipefail

HOST="${OPENHANDS_HOST:-https://app.all-hands.dev}"
NAME="HERMES JARVIS Nightly Continuation Engineer"
SCHEDULE="30 23 * * *"
TZ_NAME="Asia/Kolkata"
TIMEOUT=1800
REPO="https://github.com/gahonsh-blip/jarvis-voice-ai"
# Current automation id, for reference when a prompt change requires delete+recreate.
CURRENT_ID="0455e7b3-f648-4378-a2e7-ff0b443ec850"

: "${OPENHANDS_API_KEY:?OPENHANDS_API_KEY is required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/hermes-nightly-prompt.md"
[ -f "$PROMPT_FILE" ] || { echo "missing $PROMPT_FILE" >&2; exit 1; }

# Build the request body with python so the prompt is escaped correctly.
BODY="$(python3 - "$PROMPT_FILE" "$NAME" "$SCHEDULE" "$TZ_NAME" "$TIMEOUT" "$REPO" <<'PY'
import json, sys
path, name, schedule, tz, timeout, repo = sys.argv[1:7]
prompt = open(path, encoding="utf-8").read()
print(json.dumps({
    "name": name,
    "prompt": prompt,
    "trigger": {"type": "cron", "schedule": schedule, "timezone": tz},
    "timeout": int(timeout),
    "repos": [{"url": repo, "ref": "main"}],
}))
PY
)"

if [ "${1:-}" = "--dry-run" ]; then
  echo "HOST=${HOST}"
  echo "NAME=${NAME}"
  echo "SCHEDULE=${SCHEDULE}"
  echo "TZ=${TZ_NAME}"
  echo "TIMEOUT=${TIMEOUT}"
  echo "REPO=${REPO}"
  echo "PROMPT_CHARS=$(wc -c < "$PROMPT_FILE")"
  python3 -c 'import json,sys; json.loads(sys.argv[1]); print("BODY_JSON=OK")' "$BODY"
  exit 0
fi

echo "Creating automation '${NAME}' (replaces ${CURRENT_ID}; delete that id first if it still exists) ..."
curl -sS -X POST "${HOST}/api/automation/v1/preset/prompt" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$BODY" -w "\nHTTP:%{http_code}\n"
