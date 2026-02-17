// Connection
export { closeConnection, getRedisConnection } from "./src/connection";
// Jobs
export { queueAiChatRetry } from "./src/jobs/ai-chat.jobs";
export {
	queueEmail,
	queueSimpleEmail,
	queueTemplateEmail,
} from "./src/jobs/email.jobs";
export { queueContactSync } from "./src/jobs/integration-sync.jobs";
export { queueWatcherCheck } from "./src/jobs/watcher-check.jobs";
export {
	queueWebhooks,
	retryWebhookDelivery,
	type WebhookPayload,
} from "./src/jobs/webhook.jobs";
// Queues
export {
	AI_CHAT_QUEUE_NAME,
	closeAiChatQueue,
	getAiChatQueue,
} from "./src/queues/ai-chat.queue";
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
	closeWatcherCheckQueue,
	getWatcherCheckQueue,
	WATCHER_CHECK_QUEUE_NAME,
} from "./src/queues/watcher-check.queue";
export {
	closeWebhookQueue,
	getWebhookQueue,
	WEBHOOK_QUEUE_NAME,
} from "./src/queues/webhook.queue";
// Types
export type {
	AiChatJobData,
	AiChatJobResult,
	EmailJobData,
	EmailJobResult,
	IntegrationSyncJobData,
	IntegrationSyncJobResult,
	IntegrationSyncOperationType,
	IntegrationSyncTrigger,
	ScheduledJobData,
	ScheduledJobResult,
	WatcherCheckJobData,
	WatcherCheckJobResult,
	WebhookJobData,
	WebhookJobResult,
} from "./src/types";
// Workers (for worker process)
export { createAiChatWorker } from "./src/workers/ai-chat.worker";
export { createEmailWorker } from "./src/workers/email.worker";
export { createIntegrationSyncWorker } from "./src/workers/integration-sync.worker";
export { createScheduledWorker } from "./src/workers/scheduled.worker";
export {
	createWatcherCheckWorker,
	type WatcherCheckWorkerDeps,
	type WatcherNotificationPayload,
} from "./src/workers/watcher-check.worker";
export { createWebhookWorker } from "./src/workers/webhook.worker";

// Cleanup utilities
import { closeConnection } from "./src/connection";
import { closeAiChatQueue } from "./src/queues/ai-chat.queue";
import { closeEmailQueue } from "./src/queues/email.queue";
import { closeIntegrationSyncQueue } from "./src/queues/integration-sync.queue";
import { closeScheduledQueue } from "./src/queues/scheduled.queue";
import { closeWatcherCheckQueue } from "./src/queues/watcher-check.queue";
import { closeWebhookQueue } from "./src/queues/webhook.queue";

/**
 * Gracefully shutdown all job queues and connections.
 * Call this during application shutdown for clean resource cleanup.
 */
export async function shutdownJobs(): Promise<void> {
	await Promise.allSettled([
		closeAiChatQueue(),
		closeEmailQueue(),
		closeIntegrationSyncQueue(),
		closeScheduledQueue(),
		closeWatcherCheckQueue(),
		closeWebhookQueue(),
	]);

	await closeConnection();
}
