-- Backfill `bot_follow_up` rows for silence nudges sent before the table
-- existed (ai_message.isFollowUp = true; 13 rows on 2026-09-24..29), so the
-- "Bot follow-ups" page and the customer Bot tab show them.
--
--   status/outcome = replied  when the customer wrote within 24 h of the nudge
--                  = no_reply otherwise
--
-- Idempotent: a nudge that already has a row (same ai_message id) is skipped,
-- and the row id is derived from the message id.
--
-- DRY RUN by default: the transaction ends with ROLLBACK and prints what it
-- would insert. To apply, change the last line to COMMIT.
--
--   docker exec -i $(docker ps --filter label=coolify.resourceName=libancom-db -q) \
--     psql -U postgres -d libancom < backfill-silence-bot-follow-ups.sql

BEGIN;

WITH nudges AS (
	SELECT
		m.id AS message_id,
		m."conversationId" AS conversation_id,
		m.content,
		m."externalMsgId" AS external_id,
		m."createdAt" AS sent_at,
		c."agentId" AS agent_id,
		c."verifiedCustomerId" AS customer_id,
		a."organizationId" AS organization_id,
		(
			SELECT r."createdAt"
			FROM ai_message r
			WHERE r."conversationId" = m."conversationId"
			  AND r.role = 'user'
			  AND r."createdAt" > m."createdAt"
			  AND r."createdAt" <= m."createdAt" + INTERVAL '24 hours'
			ORDER BY r."createdAt"
			LIMIT 1
		) AS reply_at,
		(
			SELECT r.content
			FROM ai_message r
			WHERE r."conversationId" = m."conversationId"
			  AND r.role = 'user'
			  AND r."createdAt" > m."createdAt"
			  AND r."createdAt" <= m."createdAt" + INTERVAL '24 hours'
			ORDER BY r."createdAt"
			LIMIT 1
		) AS reply
	FROM ai_message m
	JOIN ai_conversation c ON c.id = m."conversationId"
	JOIN ai_agent a ON a.id = c."agentId"
	WHERE m."isFollowUp" = true
	  AND m.role = 'assistant'
	  AND NOT EXISTS (
		SELECT 1 FROM bot_follow_up b WHERE b."aiMessageId" = m.id
	  )
),
inserted AS (
	INSERT INTO bot_follow_up (
		id, "organizationId", "agentId", type, channel, status, outcome,
		"customerId", "conversationId", "sentAt", "messageText",
		"externalMessageId", "aiMessageId", reply, "replyAt",
		"createdAt", "updatedAt"
	)
	SELECT
		'bfs' || substr(md5(n.message_id), 1, 22),
		n.organization_id,
		n.agent_id,
		'silence',
		'bot',
		CASE WHEN n.reply_at IS NULL THEN 'no_reply' ELSE 'replied' END,
		CASE WHEN n.reply_at IS NULL THEN 'no_reply' ELSE NULL END,
		n.customer_id,
		n.conversation_id,
		n.sent_at,
		n.content,
		n.external_id,
		n.message_id,
		left(n.reply, 2000),
		n.reply_at,
		n.sent_at,
		NOW()
	FROM nudges n
	RETURNING id, "conversationId", status, "sentAt"
)
SELECT * FROM inserted ORDER BY "sentAt";

-- Change to COMMIT to apply.
ROLLBACK;
