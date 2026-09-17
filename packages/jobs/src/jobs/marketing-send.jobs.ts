import { getMarketingSendQueue } from "../queues/marketing-send.queue";
import type { MarketingSendJobData } from "../types";

function jobIdFor(broadcastId: string): string {
	return `broadcast-${broadcastId}`;
}

/**
 * Queue a broadcast send. With `scheduledAt` in the future the job is added
 * as a BullMQ delayed job (persisted in Redis, survives worker restarts) and
 * fires at that time; otherwise it runs as soon as a worker is free.
 */
export async function queueMarketingSend(
	data: MarketingSendJobData,
	options: { scheduledAt?: Date | null } = {},
): Promise<string> {
	const queue = getMarketingSendQueue();
	const delay = options.scheduledAt
		? Math.max(0, options.scheduledAt.getTime() - Date.now())
		: 0;
	const job = await queue.add("send-broadcast", data, {
		jobId: jobIdFor(data.broadcastId),
		...(delay > 0 && { delay }),
	});
	return job.id ?? "";
}

/**
 * Move a not-yet-started broadcast to a new send time (or to "now" with
 * `null`). The job id is fixed per broadcast, so the existing job is removed
 * first — BullMQ ignores an add whose id already exists. A job that is
 * already running is left alone.
 */
export async function rescheduleMarketingSend(
	broadcastId: string,
	scheduledAt: Date | null,
): Promise<void> {
	const queue = getMarketingSendQueue();
	const existing = await queue.getJob(jobIdFor(broadcastId));
	if (existing) {
		if ((await existing.getState()) === "active") {
			return;
		}
		await existing.remove();
	}
	await queueMarketingSend({ broadcastId }, { scheduledAt });
}
