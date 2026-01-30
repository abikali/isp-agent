import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { EmailJobData } from "../types";

export const EMAIL_QUEUE_NAME = "email";

let emailQueue: Queue<EmailJobData> | null = null;

export function getEmailQueue(): Queue<EmailJobData> {
	if (!emailQueue) {
		emailQueue = new Queue<EmailJobData>(EMAIL_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 3,
				backoff: {
					type: "exponential",
					delay: 1000,
				},
				removeOnComplete: {
					age: 24 * 60 * 60, // 24 hours
					count: 1000,
				},
				removeOnFail: {
					age: 7 * 24 * 60 * 60, // 7 days
				},
			},
		});
	}
	return emailQueue;
}

export async function closeEmailQueue(): Promise<void> {
	if (emailQueue) {
		await emailQueue.close();
		emailQueue = null;
	}
}
