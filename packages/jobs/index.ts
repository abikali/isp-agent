// Connection
export { closeConnection, getRedisConnection } from "./src/connection";
// Jobs
export {
	queueEmail,
	queueSimpleEmail,
	queueTemplateEmail,
} from "./src/jobs/email.jobs";
export { queueContactSync } from "./src/jobs/integration-sync.jobs";
export {
	queueWebhooks,
	retryWebhookDelivery,
	type WebhookPayload,
} from "./src/jobs/webhook.jobs";
// Queues
export {
	closeEmailQueue,
	EMAIL_QUEUE_NAME,
	getEmailQueue,
} from "./src/queues/email.queue";
export {
	closeIntegrationSyncQueue,
	getIntegrationSyncQueue,
	INTEGRATION_SYNC_QUEUE_NAME,
} from "./src/queues/integration-sync.queue";
export {
	closeScheduledQueue,
	getScheduledQueue,
	SCHEDULED_QUEUE_NAME,
	setupScheduledJobs,
} from "./src/queues/scheduled.queue";
export {
	closeWebhookQueue,
	getWebhookQueue,
	WEBHOOK_QUEUE_NAME,
} from "./src/queues/webhook.queue";
// Types
export type {
	EmailJobData,
	EmailJobResult,
	IntegrationSyncJobData,
	IntegrationSyncJobResult,
	IntegrationSyncOperationType,
	IntegrationSyncTrigger,
	ScheduledJobData,
	ScheduledJobResult,
	WebhookJobData,
	WebhookJobResult,
} from "./src/types";
// Workers (for worker process)
export { createEmailWorker } from "./src/workers/email.worker";
export { createIntegrationSyncWorker } from "./src/workers/integration-sync.worker";
export { createScheduledWorker } from "./src/workers/scheduled.worker";
export { createWebhookWorker } from "./src/workers/webhook.worker";

// Cleanup utilities
import { closeConnection } from "./src/connection";
import { closeEmailQueue } from "./src/queues/email.queue";
import { closeIntegrationSyncQueue } from "./src/queues/integration-sync.queue";
import { closeScheduledQueue } from "./src/queues/scheduled.queue";
import { closeWebhookQueue } from "./src/queues/webhook.queue";

/**
 * Gracefully shutdown all job queues and connections.
 * Call this during application shutdown for clean resource cleanup.
 */
export async function shutdownJobs(): Promise<void> {
	await Promise.allSettled([
		closeEmailQueue(),
		closeIntegrationSyncQueue(),
		closeScheduledQueue(),
		closeWebhookQueue(),
	]);

	await closeConnection();
}
