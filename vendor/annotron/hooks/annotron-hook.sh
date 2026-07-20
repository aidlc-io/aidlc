#!/bin/sh
# annotron bridge hook. Forwards a Claude Code hook event to the local annotron
# server so the browser can mirror activity, show status, and (optionally) gate
# tool permissions.
#
# Usage (from hooks.json):
#   annotron-hook.sh gate  /hook/pretool     # PreToolUse — may return a decision
#   annotron-hook.sh fire  /hook/posttool    # PostToolUse — fire-and-forget
#   annotron-hook.sh fire  /hook/notify      # Notification
#   annotron-hook.sh fire  /hook/stop        # Stop
#
# Design goals: zero cost when annotron isn't running (curl fails fast → allow),
# never blocks annotron's own CLI, no hard dependency on jq (server parses JSON).

mode="$1"
endpoint="$2"
input=$(cat)

host="${ANNOTRON_HOST:-127.0.0.1}"
port="${ANNOTRON_PORT:-7321}"
url="http://$host:$port$endpoint"

if [ "$mode" = "gate" ]; then
  # (annotron's own CLI calls are exempted server-side, after a proper JSON
  #  parse — matching raw stdin here is unreliable with escaped quotes/paths.)
  # Long timeout: the server may hold the request while the user decides in the
  # browser. It resolves to "ask" (terminal fallback) well before this ceiling.
  resp=$(printf '%s' "$input" | curl -s --max-time 185 \
    -H 'Content-Type: application/json' --data-binary @- "$url" 2>/dev/null) || exit 0
  [ -z "$resp" ] && exit 0    # empty = defer to Claude Code's normal flow
  printf '%s' "$resp"         # echo the decision JSON back to Claude Code
  exit 0
fi

# fire-and-forget: short timeout, never block the tool; ignore the response.
printf '%s' "$input" | curl -s --max-time 3 \
  -H 'Content-Type: application/json' --data-binary @- "$url" >/dev/null 2>&1 || true
exit 0
