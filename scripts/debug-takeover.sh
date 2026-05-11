#!/usr/bin/env bash
# Live debug for human-takeover behavior on production.
#
# Run this on your laptop. It opens an SSH session to prod, tails the web
# server log for relevant lines, and prints a short DB summary every 5s
# showing the latest active conversations, their humanTakeoverAt state, and
# the last role/content recorded.
#
# While it's running, send a message from the bot's WhatsApp on your phone
# (text or voice) to a test customer chat, then have the customer reply.
# The script's output will reveal whether:
#   - the admin webhook reached the server (look for "[WEBHOOK fromMe]" / "[FP-MATCH]" / "Human takeover activated")
#   - takeover was set in the DB (look at the human_takeover_at column)
#   - the bot replied anyway after takeover (look at lastMessageAt vs takeover time)

set -euo pipefail

PROD_HOST="root@159.223.220.101"
PG_PASS="0bJzvNbiLM9hAWzhGl9l7z6H"
LOG_PATH="/home/libancom/.logs/workers/7.log"
AGENT_ID="cmlci39ed0000ags5jge558ci"

# Optional: pass a chatId substring as $1 to filter both the log tail and DB
# query to a single conversation. Useful when one specific test is in flight.
CHAT_FILTER="${1:-}"

echo "── Debug takeover live ───────────────────────────────────────────"
echo "Press Ctrl-C to stop. Filter: ${CHAT_FILTER:-<none>}"
echo

# ── Stream the log in background, prefixed and filtered to relevant lines ──
ssh "$PROD_HOST" "tail -F $LOG_PATH" \
  | grep --line-buffered -E "Human takeover activated|Dropping AI reply|AI reply loop aborted|AI generation aborted|Audio transcription|fromMe|webhook" \
  | { if [ -n "$CHAT_FILTER" ]; then grep --line-buffered "$CHAT_FILTER"; else cat; fi; } \
  | sed -u 's/^/[LOG] /' &
LOG_PID=$!
trap 'kill $LOG_PID 2>/dev/null || true' EXIT

# ── Periodically dump DB state ──
while true; do
  sleep 5
  WHERE_CLAUSE=""
  if [ -n "$CHAT_FILTER" ]; then
    WHERE_CLAUSE="AND c.\"externalChatId\" LIKE '%${CHAT_FILTER}%'"
  fi

  echo
  echo "── $(date '+%H:%M:%S') ─ DB state (latest active conversations) ──"
  ssh "$PROD_HOST" "PGPASSWORD='$PG_PASS' psql -U libancom -d libancom -h localhost -A -F '|' -t <<SQL
SELECT
  c.\"contactName\",
  c.\"externalChatId\",
  c.human_takeover_at,
  c.\"lastMessageAt\",
  (SELECT m.role FROM ai_message m WHERE m.\"conversationId\" = c.id ORDER BY m.\"createdAt\" DESC LIMIT 1) AS last_role,
  LEFT((SELECT m.content FROM ai_message m WHERE m.\"conversationId\" = c.id ORDER BY m.\"createdAt\" DESC LIMIT 1), 60) AS last_content
FROM ai_conversation c
WHERE c.\"agentId\" = '$AGENT_ID'
  AND c.status = 'active'
  AND c.\"lastMessageAt\" > NOW() - INTERVAL '15 minutes'
  $WHERE_CLAUSE
ORDER BY c.\"lastMessageAt\" DESC
LIMIT 5;
SQL" 2>/dev/null | sed -u 's/^/[DB ] /'
done
