#!/usr/bin/env bash
# Create the HERMES JARVIS autonomous nightly-window automation.
#
# Usage:
#   OPENHANDS_API_KEY=... ./automation/deploy-hermes-window.sh
#
# The platform caps a single run at 1800s, so the 21:00->05:00 IST window is
# built from 16 back-to-back 30-minute slots rather than one long run.
#
# Note: PATCH on an existing automation can change name/trigger/enabled/timeout
# but NOT the prompt. To change the prompt, delete the automation and re-run
# this script (a new id is created).
set -euo pipefail

HOST="${OPENHANDS_HOST:-https://app.all-hands.dev}"
NAME="HERMES JARVIS Autonomous Nightly Window"
SCHEDULE="05,35 21-23,0-4 * * *"
TZ_NAME="Asia/Kolkata"
TIMEOUT=1800
REPO="https://github.com/gahonsh-blip/jarvis-voice-ai"

: "${OPENHANDS_API_KEY:?OPENHANDS_API_KEY is required}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROMPT_FILE="${SCRIPT_DIR}/hermes-autonomous-window-prompt.md"
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
    "repos": [repo],
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

echo "Creating automation '${NAME}' ..."
curl -sS -X POST "${HOST}/api/automation/v1/preset/prompt" \
  -H "Authorization: Bearer ${OPENHANDS_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "$BODY" -w "\nHTTP:%{http_code}\n"