import { resolveFollowUpFireAt } from "@repo/ai";
import { logger } from "@repo/logs";
import { getAiFollowUpQueue } from "../queues/ai-followup.queue";
import type { AiFollowUpJobData } from "../types";

// BullMQ rejects custom job ids containing ":" ("Custom Id cannot contain :").
function jobIdFor(conversationId: string): string {
	return `followup-${conversationId}`;
}

/**
 * Schedule the one nudge for this conversation, replacing any pending one.
 * A nudge due outside the Beirut follow-up window moves to the next
 * morning, or is not scheduled at all (see `resolveFollowUpFireAt`).
 * Remove-before-add is required: BullMQ ignores `add` while a job with the
 * same id exists in ANY set (delayed, active, completed, failed).
 */
export async function scheduleFollowUp(input: {
	conversationId: string;
	channelId: string;
	repliedAt: Date;
	delayMinutes: number;
}): Promise<void> {
	const queue = getAiFollowUpQueue();
	const jobId = jobIdFor(input.conversationId);
	await cancelFollowUp(input.conversationId);
	const fireAt = resolveFollowUpFireAt(input.repliedAt, input.delayMinutes);
	if (!fireAt) {
		logger.info("[ai-followup] not scheduled: outside follow-up hours", {
			conversationId: input.conversationId,
		});
		return;
	}
	const data: AiFollowUpJobData = {
		conversationId: input.conversationId,
		channelId: input.channelId,
		repliedAt: input.repliedAt.toISOString(),
	};
	await queue.add("ai-followup", data, {
		jobId,
		delay: Math.max(0, fireAt.getTime() - Date.now()),
	});
}

/** Best-effort: the worker re-checks `lastMessageAt` anyway. */
export async function cancelFollowUp(conversationId: string): Promise<void> {
	try {
		const job = await getAiFollowUpQueue().getJob(jobIdFor(conversationId));
		if (job) {
			await job.remove();
		}
	} catch (error) {
		// An active (locked) job cannot be removed; the worker's own
		// lastMessageAt check covers that window.
		logger.debug("[ai-followup] cancel skipped", {
			conversationId,
			error: String(error),
		});
	}
}
