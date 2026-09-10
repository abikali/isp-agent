import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { AiFollowUpJobData } from "../types";

export const AI_FOLLOWUP_QUEUE_NAME = "ai-followup";

let queue: Queue<AiFollowUpJobData> | null = null;

/**
 * Delayed one-shot nudges. `attempts: 1` — a follow-up that failed must not
 * fire later when the moment has passed. `removeOnComplete: true` — jobs use
 * a deterministic id per conversation, and BullMQ silently ignores `add`
 * while any job with that id still exists in any set.
 */
export function getAiFollowUpQueue(): Queue<AiFollowUpJobData> {
	if (!queue) {
		queue = new Queue<AiFollowUpJobData>(AI_FOLLOWUP_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 1,
				removeOnComplete: true,
				removeOnFail: { age: 24 * 60 * 60 },
			},
		});
	}
	return queue;
}

export async function closeAiFollowUpQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}
