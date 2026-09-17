import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { WhatsAppTemplateJobData } from "../types";

export const WHATSAPP_TEMPLATE_QUEUE_NAME = "whatsapp-template";

let queue: Queue<WhatsAppTemplateJobData> | null = null;

export function getWhatsAppTemplateQueue(): Queue<WhatsAppTemplateJobData> {
	if (!queue) {
		queue = new Queue<WhatsAppTemplateJobData>(
			WHATSAPP_TEMPLATE_QUEUE_NAME,
			{
				connection: getRedisConnection(),
				defaultJobOptions: {
					attempts: 3,
					backoff: {
						type: "exponential",
						delay: 30_000,
					},
					removeOnComplete: {
						age: 24 * 60 * 60,
						count: 1000,
					},
					removeOnFail: {
						age: 7 * 24 * 60 * 60,
					},
				},
			},
		);
	}
	return queue;
}

export async function closeWhatsAppTemplateQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}
