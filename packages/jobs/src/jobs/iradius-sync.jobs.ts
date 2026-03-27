import { getIRadiusSyncQueue } from "../queues/iradius-sync.queue";
import type { IRadiusSyncJobData } from "../types";

export async function queueIRadiusSync(
	data: IRadiusSyncJobData,
): Promise<void> {
	const queue = getIRadiusSyncQueue();
	await queue.add("iradius-sync", data, {
		jobId: data.operationId,
	});
}
