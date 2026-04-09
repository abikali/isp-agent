import { logger } from "@repo/logs";
import { UnrecoverableError, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { runCreateLocationRequest } from "../lib/location-request-helper";
import { getWorkerConcurrency } from "../lib/worker-concurrency";
import { LOCATION_REQUEST_QUEUE_NAME } from "../queues/location-request.queue";
import type {
	LocationRequestJobData,
	LocationRequestJobResult,
} from "../types";

/**
 * Processes bulk location-request sends at a controlled concurrency to
 * respect WPBox / Meta WhatsApp rate limits. Each job runs the same logic
 * as the in-request single-customer path; on failure BullMQ retries with
 * exponential backoff.
 */
export function createLocationRequestWorker(): Worker<
	LocationRequestJobData,
	LocationRequestJobResult
> {
	return new Worker<LocationRequestJobData, LocationRequestJobResult>(
		LOCATION_REQUEST_QUEUE_NAME,
		async (job) => {
			const result = await runCreateLocationRequest(job.data);

			if (!result.ok) {
				// `customer_not_found` and `no_phone` are permanent — retrying
				// won't help. `UnrecoverableError` tells BullMQ to skip the
				// remaining attempts and mark the job failed immediately.
				logger.warn("[Location Request] Permanent failure", {
					customerId: job.data.customerId,
					reason: result.reason,
				});
				throw new UnrecoverableError(
					`Permanent failure: ${result.reason ?? "unknown"}`,
				);
			}

			if (!result.whatsappSent) {
				// Token row was created but WhatsApp delivery failed — let
				// BullMQ retry with exponential backoff (attempts configured
				// on the queue).
				throw new Error(
					`WhatsApp send failed for customer ${job.data.customerId}`,
				);
			}

			return { success: true };
		},
		{
			connection: getRedisConnection(),
			concurrency: getWorkerConcurrency(
				"LOCATION_REQUEST_WORKER_CONCURRENCY",
				5,
			),
		},
	);
}
