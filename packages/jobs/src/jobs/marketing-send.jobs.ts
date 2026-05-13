import { getMarketingSendQueue } from "../queues/marketing-send.queue";
import type { MarketingSendJobData } from "../types";

export async function queueMarketingSend(
	data: MarketingSendJobData,
): Promise<string> {
	const queue = getMarketingSendQueue();
	const job = await queue.add("send-broadcast", data, {
		jobId: `broadcast:${data.broadcastId}`,
	});
	return job.id ?? "";
}
