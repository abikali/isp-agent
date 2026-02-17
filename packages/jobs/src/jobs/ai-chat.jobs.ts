import { getAiChatQueue } from "../queues/ai-chat.queue";
import type { AiChatJobData } from "../types";

export async function queueAiChatRetry(data: AiChatJobData): Promise<void> {
	const queue = getAiChatQueue();
	await queue.add("ai-chat-retry", data, {
		delay: 1000, // 1 second delay before retry
	});
}
