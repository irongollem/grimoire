#!/bin/bash
# Posts the /whats-new messages to the Discord channel behind the webhook in
# .env.local (DISCORD_WHATS_NEW_WEBHOOK). Run by the skill, after the user has
# said yes to the exact text.
#
#   post-to-discord.sh --check            is a webhook configured, and where does it post?
#   post-to-discord.sh msg1.md [msg2.md]  post each file as one message, in order
#
# The URL is read here and never printed: whoever holds it can post to the
# channel, and this repo is public. Discord's replies carry it too (as `token`
# and `url`), so every response goes through jq and only named fields come out.
#
# Exit codes: 0 done, 1 refused or failed, 2 no webhook configured (the skill
# falls back to handing the text over for pasting).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
ENV_FILE="$ROOT/.env.local"
VAR="DISCORD_WHATS_NEW_WEBHOOK"
LIMIT=2000

url=""
if [ -f "$ENV_FILE" ]; then
  # Last assignment wins, as it would in a shell; surrounding quotes are optional.
  url="$(command grep -E "^${VAR}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2- | tr -d '\r' | sed -E "s/^[\"']//; s/[\"']$//")"
fi
if [ -z "$url" ]; then
  echo "No $VAR in .env.local: nothing posted." >&2
  exit 2
fi
# A typo here would send the announcement, or the request body, somewhere else.
if ! [[ "$url" =~ ^https://(discord|discordapp)\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+$ ]]; then
  echo "$VAR is not a Discord webhook URL: nothing posted." >&2
  exit 1
fi

# Runs curl and leaves the reply in $body and the HTTP status in $status. Call
# it bare, never inside $(...): a subshell would throw both away.
status=""
body=""
request() {
  local out
  out="$(curl -sS --max-time 20 -w '\n%{http_code}' "$@")"
  status="${out##*$'\n'}"
  body="${out%$'\n'*}"
}

if [ "${1:-}" = "--check" ]; then
  request "$url"
  if [ "$status" != "200" ]; then
    echo "Webhook check failed: HTTP $status $(printf '%s' "$body" | jq -r '.message? // empty' 2>/dev/null)" >&2
    exit 1
  fi
  printf '%s' "$body" | jq -r '"Webhook \"\(.name)\" posts to channel \(.channel_id) in server \(.guild_id)."'
  exit 0
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: post-to-discord.sh --check | <message.md> [<message.md> ...]" >&2
  exit 1
fi

# Check every file before sending any: a post that stops half way is worse
# than one that never started.
for file in "$@"; do
  if [ ! -s "$file" ]; then
    echo "$file is missing or empty: nothing posted." >&2
    exit 1
  fi
  chars="$(jq -Rs 'sub("\\s+$"; "") | length' <"$file")"
  if [ "$chars" -gt "$LIMIT" ]; then
    echo "$file is $chars characters, over Discord's $LIMIT: nothing posted." >&2
    exit 1
  fi
done

sent=0
for file in "$@"; do
  # allowed_mentions empty: the text talks about @mentions and must never ping
  # anyone. flags 4 suppresses link previews under an announcement.
  payload="$(jq -Rs '{content: sub("\\s+$"; ""), allowed_mentions: {parse: []}, flags: 4}' <"$file")"
  # wait=true makes Discord answer with the created message, not an empty 204,
  # which is the only proof it landed. It also keeps two messages in order.
  request -X POST -H 'Content-Type: application/json' --data-binary "$payload" "${url}?wait=true"
  if [ "$status" != "200" ]; then
    echo "Posting $file failed: HTTP $status $(printf '%s' "$body" | jq -r '.message? // empty' 2>/dev/null)" >&2
    echo "$sent of $# messages were posted before this." >&2
    exit 1
  fi
  sent=$((sent + 1))
  printf '%s' "$body" | jq -r '"Posted message \(.id) to channel \(.channel_id)."'
done
