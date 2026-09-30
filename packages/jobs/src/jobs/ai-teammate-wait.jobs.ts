import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { getAiChatQueue } from "../queues/ai-chat.queue";
import type {
	AiChatJobData,
	TeammateWaitOrigin,
	TeammateWaitStage,
} from "../types";

/** Alert the team on Telegram this long after the customer started waiting. */
export const TEAMMATE_ALERT_AFTER_MS = 10 * 60_000;
/** Let the bot answer this long after (and never during a takeover). */
export const TEAMMATE_BOT_TAKEOVER_AFTER_MS = 30 * 60_000;

const STAGES: TeammateWaitStage[] = ["alert", "reply"];

// BullMQ rejects custom job ids containing ":".
function jobIdFor(conversationId: string, stage: TeammateWaitStage): string {
	return `teammate-wait-${conversationId}-${stage}`;
}

/**
 * Queue one step of the wait for a teammate's reply. A job with the same id
 * already pending makes this a no-op, so the clock starts at the first
 * unanswered message and never slides.
 */
export async function scheduleTeammateWait(input: {
	conversationId: string;
	channelId: string;
	stage: TeammateWaitStage;
	origin: TeammateWaitOrigin;
	fireAt: Date;
}): Promise<void> {
	const data: AiChatJobData = {
		conversationId: input.conversationId,
		channelId: input.channelId,
		stage: input.stage,
		origin: input.origin,
	};
	await getAiChatQueue().add("teammate-wait", data, {
		jobId: jobIdFor(input.conversationId, input.stage),
		delay: Math.max(0, input.fireAt.getTime() - Date.now()),
		attempts: 1,
		removeOnComplete: true,
		removeOnFail: true,
	});
}

/** Drop any pending teammate-wait steps for this conversation. */
export async function cancelTeammateWait(
	conversationId: string,
): Promise<void> {
	const queue = getAiChatQueue();
	for (const stage of STAGES) {
		try {
			const job = await queue.getJob(jobIdFor(conversationId, stage));
			if (job) {
				await job.remove();
			}
		} catch (error) {
			// An active job cannot be removed; it re-checks the flag itself.
			logger.debug("[teammate-wait] cancel skipped", {
				conversationId,
				stage,
				error: String(error),
			});
		}
	}
}

/**
 * The bot held back because a teammate is handling the chat: start the wait
 * (only when not already waiting) and queue the Telegram alert.
 */
export async function markAwaitingHuman(input: {
	conversationId: string;
	channelId: string;
	origin: TeammateWaitOrigin;
}): Promise<void> {
	const since = new Date();
	const started = await db.aiConversation.updateMany({
		where: { id: input.conversationId, awaitingHumanSince: null },
		data: { awaitingHumanSince: since },
	});
	if (started.count === 0) {
		return;
	}
	await scheduleTeammateWait({
		...input,
		stage: "alert",
		fireAt: new Date(since.getTime() + TEAMMATE_ALERT_AFTER_MS),
	});
}

/**
 * Someone answered the customer (teammate or bot): the wait is over. Cheap
 * no-op when nothing was pending.
 */
export async function clearAwaitingHuman(
	conversationId: string,
): Promise<void> {
	const cleared = await db.aiConversation.updateMany({
		where: { id: conversationId, awaitingHumanSince: { not: null } },
		data: { awaitingHumanSince: null },
	});
	if (cleared.count > 0) {
		await cancelTeammateWait(conversationId);
	}
}
