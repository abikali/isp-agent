import { config } from "@repo/config";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { runFollowUp } from "../lib/ai-follow-up";
import { AI_FOLLOWUP_QUEUE_NAME } from "../queues/ai-followup.queue";
import type { AiFollowUpJobData, AiFollowUpJobResult } from "../types";

/** Scheduled silence nudges — the checks and the send live in `runFollowUp`. */
export function createAiFollowUpWorker(): Worker<
	AiFollowUpJobData,
	AiFollowUpJobResult
> {
	return new Worker<AiFollowUpJobData, AiFollowUpJobResult>(
		AI_FOLLOWUP_QUEUE_NAME,
		async (job: Job<AiFollowUpJobData>) => {
			const result = await runFollowUp({
				conversationId: job.data.conversationId,
				repliedAt: new Date(job.data.repliedAt),
				attempt: job.data.attempt,
				jobId: job.id,
			});
			return result.skipped
				? { success: true, skipped: result.skipped }
				: { success: result.sent };
		},
		{
			connection: getRedisConnection(),
			concurrency: config.jobs.workers.aiFollowup.concurrency,
		},
	);
}
