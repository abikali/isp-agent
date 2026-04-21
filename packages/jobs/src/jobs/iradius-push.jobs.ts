import { getIRadiusPushQueue } from "../queues/iradius-push.queue";
import type { IRadiusPushJobData } from "../types";

export async function queueIRadiusPush(
	data: IRadiusPushJobData,
): Promise<void> {
	const queue = getIRadiusPushQueue();
	await queue.add("iradius-push", data, {
		jobId: data.operationId,
	});
}
