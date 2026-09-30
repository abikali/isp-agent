import { logger } from "@repo/logs";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { processSaltiInbound } from "../lib/outreach";
import { SALTI_INBOUND_QUEUE_NAME } from "../queues/salti-inbound.queue";
import type { SaltiInboundJobData, SaltiInboundJobResult } from "../types";

export function createSaltiInboundWorker(): Worker<
	SaltiInboundJobData,
	SaltiInboundJobResult
> {
	return new Worker<SaltiInboundJobData, SaltiInboundJobResult>(
		SALTI_INBOUND_QUEUE_NAME,
		async (job) => {
			const result = await processSaltiInbound(job.data.body);
			if (result.matched > 0) {
				logger.info("[salti-inbound] processed", {
					jobId: job.id,
					...result,
				});
			}
			return result;
		},
		{ connection: getRedisConnection(), concurrency: 1 },
	);
}
