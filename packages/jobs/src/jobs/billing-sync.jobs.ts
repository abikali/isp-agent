import { getBillingSyncQueue } from "../queues/billing-sync.queue";
import type { BillingSyncJobData } from "../types";

export async function queueBillingSync(
	data: BillingSyncJobData,
): Promise<void> {
	const queue = getBillingSyncQueue();
	await queue.add("billing-sync", data, {
		jobId: data.operationId,
	});
}
