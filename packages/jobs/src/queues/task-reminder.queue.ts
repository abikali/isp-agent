import { Queue } from "bullmq";
import { getRedisConnection } from "../connection";
import type { TaskReminderJobData } from "../types";

export const TASK_REMINDER_QUEUE_NAME = "task-reminder";

let queue: Queue<TaskReminderJobData> | null = null;

/**
 * Delayed one-shot "task due soon" reminders. `removeOnComplete: true` —
 * jobs use a deterministic id per task, and BullMQ silently ignores `add`
 * while any job with that id still exists in any set.
 */
export function getTaskReminderQueue(): Queue<TaskReminderJobData> {
	if (!queue) {
		queue = new Queue<TaskReminderJobData>(TASK_REMINDER_QUEUE_NAME, {
			connection: getRedisConnection(),
			defaultJobOptions: {
				attempts: 2,
				backoff: { type: "fixed", delay: 30_000 },
				removeOnComplete: true,
				removeOnFail: { age: 24 * 60 * 60 },
			},
		});
	}
	return queue;
}

export async function closeTaskReminderQueue(): Promise<void> {
	if (queue) {
		await queue.close();
		queue = null;
	}
}
