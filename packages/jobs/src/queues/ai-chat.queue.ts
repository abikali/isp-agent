import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { AiChatJobData } from "../types";

export const AI_CHAT_QUEUE_NAME = "ai-chat";

let aiChatQueue: Queue<AiChatJobData> | null = null;

export function getAiChatQueue(): Queue<AiChatJobData> {
	if (!aiChatQueue) {
		aiChatQueue = new Queue<AiChatJobData>(AI_CHAT_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 2,
				backoff: {
					type: "exponential",
					delay: 2000,
				},
				removeOnComplete: {
					age: 24 * 60 * 60, // 24 hours
					count: 500,
				},
				removeOnFail: {
					age: 7 * 24 * 60 * 60, // 7 days
				},
			},
		});
	}
	return aiChatQueue;
}

export async function closeAiChatQueue(): Promise<void> {
	if (aiChatQueue) {
		await aiChatQueue.close();
		aiChatQueue = null;
	}
}
