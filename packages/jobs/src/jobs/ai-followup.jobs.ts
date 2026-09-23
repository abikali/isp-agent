import { resolveFollowUpFireAt } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { getAiFollowUpQueue } from "../queues/ai-followup.queue";
import type { AiFollowUpJobData } from "../types";

// BullMQ rejects custom job ids containing ":" ("Custom Id cannot contain :").
function jobIdFor(conversationId: string): string {
	return `followup-${conversationId}`;
}

/**
 * Schedule nudge number `attempt` for this conversation, replacing any
 * pending one. Attempt 1 waits `followUpMinutes` after the bot's reply;
 * later ones wait `followUpRepeatMinutes` after the previous nudge. Nothing
 * is scheduled when the agent turned follow-ups off, the chat is muted, the
 * attempts for this silence are used up, the chat already had its weekly
 * cap, or the nudge would land too late (see `resolveFollowUpFireAt`).
 *
 * `followUpDueAt` mirrors the job so the Conversations page can list queued
 * nudges. Remove-before-add is required: BullMQ ignores `add` while a job
 * with the same id exists in ANY set (delayed, active, completed, failed).
 */
export async function scheduleFollowUp(input: {
	conversationId: string;
	channelId: string;
	/** The bot reply (attempt 1) or the previous nudge (attempt 2+). */
	from: Date;
	attempt?: number;
}): Promise<void> {
	const { conversationId } = input;
	const attempt = input.attempt ?? 1;
	await cancelFollowUp(conversationId);

	const conversation = await db.aiConversation.findUnique({
		where: { id: conversationId },
		select: {
			channelId: true,
			externalChatId: true,
			followUpMuted: true,
			agent: {
				select: {
					followUpMinutes: true,
					followUpRepeatMinutes: true,
					followUpMaxAttempts: true,
					followUpWindowStart: true,
					followUpWindowEnd: true,
					followUpWeeklyCap: true,
				},
			},
		},
	});
	const agent = conversation?.agent;
	if (!conversation || agent?.followUpMinutes == null) {
		return;
	}
	const skip = (reason: string) => recordOutcome(conversationId, reason);
	if (conversation.followUpMuted) {
		return;
	}
	if (attempt > agent.followUpMaxAttempts) {
		return;
	}
	const recent = await countRecentFollowUps(conversation);
	if (recent >= agent.followUpWeeklyCap) {
		return skip("weekly_cap");
	}

	const fireAt = resolveFollowUpFireAt(
		input.from,
		attempt === 1 ? agent.followUpMinutes : agent.followUpRepeatMinutes,
		{ start: agent.followUpWindowStart, end: agent.followUpWindowEnd },
		attempt,
	);
	if (!fireAt) {
		logger.info("[ai-followup] not scheduled: outside follow-up hours", {
			conversationId,
		});
		return skip("outside_hours");
	}
	const data: AiFollowUpJobData = {
		conversationId,
		channelId: input.channelId,
		repliedAt: input.from.toISOString(),
		attempt,
	};
	await getAiFollowUpQueue().add("ai-followup", data, {
		jobId: jobIdFor(conversationId),
		delay: Math.max(0, fireAt.getTime() - Date.now()),
	});
	await db.aiConversation.update({
		where: { id: conversationId },
		data: { followUpDueAt: fireAt },
	});
}

/**
 * Drop the pending nudge, if any. The worker re-checks `lastMessageAt`
 * anyway, so a job that is already running (and cannot be removed) still
 * stays silent after new activity.
 */
export async function cancelFollowUp(conversationId: string): Promise<void> {
	try {
		const job = await getAiFollowUpQueue().getJob(jobIdFor(conversationId));
		if (job) {
			await job.remove();
		}
	} catch (error) {
		logger.debug("[ai-followup] cancel skipped", {
			conversationId,
			error: String(error),
		});
	}
	await db.aiConversation
		.updateMany({
			where: { id: conversationId, followUpDueAt: { not: null } },
			data: { followUpDueAt: null },
		})
		.catch(() => {});
}

const WEEK_MS = 7 * 24 * 60 * 60_000;

/**
 * Nudges this chat received in the last 7 days. Counted per chat (channel +
 * WhatsApp/Telegram id), not per conversation row, so archiving and
 * reopening a conversation does not reset the cap.
 */
export function countRecentFollowUps(chat: {
	channelId: string | null;
	externalChatId: string;
}): Promise<number> {
	return db.aiMessage.count({
		where: {
			isFollowUp: true,
			createdAt: { gte: new Date(Date.now() - WEEK_MS) },
			conversation: {
				channelId: chat.channelId,
				externalChatId: chat.externalChatId,
			},
		},
	});
}

async function recordOutcome(
	conversationId: string,
	outcome: string,
): Promise<void> {
	await db.aiConversation.update({
		where: { id: conversationId },
		data: {
			followUpDueAt: null,
			followUpOutcome: outcome,
			followUpOutcomeAt: new Date(),
		},
	});
}
