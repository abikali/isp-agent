import { isHumanTakeoverActive } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { queueAiChatRetry } from "../jobs/ai-chat.jobs";

/**
 * Recover conversations whose generation died mid-flight.
 *
 * AI replies are generated fire-and-forget in the web process, so a deploy or
 * crash kills in-flight generations AFTER the user message was persisted —
 * the customer never gets a reply and nothing retries. On worker boot, find
 * recent active conversations whose newest message is from the customer and
 * enqueue a retry job for each (the retry worker is lock-aware, re-checks
 * takeover, and regenerates from DB history).
 *
 * Window: 2–60 minutes. Below 2 min the generation may legitimately still be
 * running; beyond 60 min a silent row is more likely an intentional skip
 * (triage classified it as noise) than a dead generation, and a bot reply
 * hours later would confuse the customer.
 */
const MIN_AGE_MS = 2 * 60 * 1000;
const MAX_AGE_MS = 60 * 60 * 1000;
const MAX_RECONCILED = 20;

export async function reconcileOrphanedAiChats(): Promise<number> {
	const now = Date.now();
	const candidates = await db.aiConversation.findMany({
		where: {
			status: "active",
			channelId: { not: null },
			lastMessageAt: {
				gte: new Date(now - MAX_AGE_MS),
				lte: new Date(now - MIN_AGE_MS),
			},
		},
		orderBy: { lastMessageAt: "desc" },
		take: 100,
		select: {
			id: true,
			channelId: true,
			humanTakeoverAt: true,
			agent: {
				select: { enabled: true, humanTakeoverHours: true },
			},
		},
	});

	let reconciled = 0;
	for (const conversation of candidates) {
		if (reconciled >= MAX_RECONCILED) {
			break;
		}
		if (
			!conversation.agent.enabled ||
			!conversation.channelId ||
			isHumanTakeoverActive(
				conversation.humanTakeoverAt,
				conversation.agent.humanTakeoverHours,
			)
		) {
			continue;
		}
		const lastMessage = await db.aiMessage.findFirst({
			where: { conversationId: conversation.id },
			orderBy: { createdAt: "desc" },
			select: { role: true },
		});
		if (lastMessage?.role !== "user") {
			continue;
		}
		try {
			await queueAiChatRetry({
				conversationId: conversation.id,
				channelId: conversation.channelId,
			});
			reconciled++;
			logger.info("Reconciled orphaned AI conversation", {
				conversationId: conversation.id,
			});
		} catch (error) {
			logger.error("Failed to queue orphaned-chat retry", {
				error,
				conversationId: conversation.id,
			});
		}
	}

	if (reconciled > 0) {
		logger.info("Orphaned AI chat reconciliation complete", { reconciled });
	}
	return reconciled;
}
