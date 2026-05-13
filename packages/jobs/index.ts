// Connection
export { closeConnection, getRedisConnection } from "./src/connection";
// Jobs
export { queueAiChatRetry } from "./src/jobs/ai-chat.jobs";
export { queueBillingSync } from "./src/jobs/billing-sync.jobs";
export {
	queueEmail,
	queueSimpleEmail,
	queueTemplateEmail,
} from "./src/jobs/email.jobs";
export { queueContactSync } from "./src/jobs/integration-sync.jobs";
export { queueIRadiusPush } from "./src/jobs/iradius-push.jobs";
export { queueIRadiusSync } from "./src/jobs/iradius-sync.jobs";
export {
	queueLocationRequest,
	queueLocationRequestsBulk,
} from "./src/jobs/location-request.jobs";
export { queueMarketingSend } from "./src/jobs/marketing-send.jobs";
export { queueOrgSetup } from "./src/jobs/org-setup.jobs";
export { queueTelegramLocationNotify } from "./src/jobs/telegram-location.jobs";
export { queueWatcherCheck } from "./src/jobs/watcher-check.jobs";
export {
	queueWebhooks,
	retryWebhookDelivery,
	type WebhookPayload,
} from "./src/jobs/webhook.jobs";
export { queueWhatsAppReceipt } from "./src/jobs/whatsapp-receipt.jobs";
// Shared helper re-exported for the API layer (single-customer inline sends)
export {
	type CreateLocationRequestResult,
	runCreateLocationRequest,
} from "./src/lib/location-request-helper";
// WPBox template senders (shared; API layer imports via @repo/jobs)
export {
	sendWhatsAppLocationRequest,
	sendWhatsAppReceipt,
} from "./src/lib/wpbox";
// Queues
export {
	AI_CHAT_QUEUE_NAME,
	closeAiChatQueue,
	getAiChatQueue,
} from "./src/queues/ai-chat.queue";
export {
	BILLING_SYNC_QUEUE_NAME,
	closeBillingSyncQueue,
	getBillingSyncQueue,
} from "./src/queues/billing-sync.queue";
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
	closeIRadiusPushQueue,
	getIRadiusPushQueue,
	IRADIUS_PUSH_QUEUE_NAME,
} from "./src/queues/iradius-push.queue";
export {
	closeIRadiusSyncQueue,
	getIRadiusSyncQueue,
	IRADIUS_SYNC_QUEUE_NAME,
} from "./src/queues/iradius-sync.queue";
export {
	closeLocationRequestQueue,
	getLocationRequestQueue,
	LOCATION_REQUEST_QUEUE_NAME,
} from "./src/queues/location-request.queue";
export {
	closeMarketingSendQueue,
	getMarketingSendQueue,
	MARKETING_SEND_QUEUE_NAME,
} from "./src/queues/marketing-send.queue";
export {
	closeOrgSetupQueue,
	getOrgSetupQueue,
	ORG_SETUP_QUEUE_NAME,
} from "./src/queues/org-setup.queue";
export {
	closeScheduledQueue,
	getScheduledQueue,
	SCHEDULED_QUEUE_NAME,
	setupScheduledJobs,
} from "./src/queues/scheduled.queue";
export {
	closeTelegramLocationQueue,
	getTelegramLocationQueue,
	TELEGRAM_LOCATION_QUEUE_NAME,
} from "./src/queues/telegram-location.queue";
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
export {
	closeWhatsAppReceiptQueue,
	getWhatsAppReceiptQueue,
	WHATSAPP_RECEIPT_QUEUE_NAME,
} from "./src/queues/whatsapp-receipt.queue";
// Types
export type {
	AiChatJobData,
	AiChatJobResult,
	BillingSyncJobData,
	BillingSyncJobResult,
	EmailJobData,
	EmailJobResult,
	IntegrationSyncJobData,
	IntegrationSyncJobResult,
	IntegrationSyncOperationType,
	IntegrationSyncTrigger,
	IRadiusPushJobData,
	IRadiusPushJobResult,
	IRadiusSyncJobData,
	IRadiusSyncJobResult,
	LocationRequestJobData,
	LocationRequestJobResult,
	MarketingSendJobData,
	MarketingSendJobResult,
	OrgSetupJobData,
	OrgSetupJobResult,
	ScheduledJobData,
	ScheduledJobResult,
	TelegramLocationJobData,
	TelegramLocationJobResult,
	WatcherCheckJobData,
	WatcherCheckJobResult,
	WebhookJobData,
	WebhookJobResult,
	WhatsAppReceiptJobData,
	WhatsAppReceiptJobResult,
} from "./src/types";
// Workers (for worker process)
export { createAiChatWorker } from "./src/workers/ai-chat.worker";
export { createBillingSyncWorker } from "./src/workers/billing-sync.worker";
export { createEmailWorker } from "./src/workers/email.worker";
export { createIntegrationSyncWorker } from "./src/workers/integration-sync.worker";
export { createIRadiusPushWorker } from "./src/workers/iradius-push.worker";
export {
	createAccountNumberGenerator,
	createIRadiusSyncWorker,
} from "./src/workers/iradius-sync.worker";
export {
	LOCAL_AUTHORITATIVE_FIELDS,
	serializeValue,
	valuesEqual,
} from "./src/workers/iradius-sync-fields";
// iRadius sync helpers (shared between worker and API)
export {
	buildCustomerDataFromRow,
	buildEmployeeDataFromRow,
	CUSTOMER_FROM_CLAUSE,
	CUSTOMER_SELECT_COLUMNS,
	EMPLOYEE_SELECT_COLUMNS,
	type SyncLookupMaps,
} from "./src/workers/iradius-sync-helpers";
export { createLocationRequestWorker } from "./src/workers/location-request.worker";
export { createMarketingSendWorker } from "./src/workers/marketing-send.worker";
export { createOrgSetupWorker } from "./src/workers/org-setup.worker";
export { createScheduledWorker } from "./src/workers/scheduled.worker";
export { createTelegramLocationWorker } from "./src/workers/telegram-location.worker";
export {
	createWatcherCheckWorker,
	type WatcherCheckWorkerDeps,
	type WatcherNotificationPayload,
} from "./src/workers/watcher-check.worker";
export { createWebhookWorker } from "./src/workers/webhook.worker";
export { createWhatsAppReceiptWorker } from "./src/workers/whatsapp-receipt.worker";

// Cleanup utilities
import { closeConnection } from "./src/connection";
import { closeAiChatQueue } from "./src/queues/ai-chat.queue";
import { closeBillingSyncQueue } from "./src/queues/billing-sync.queue";
import { closeEmailQueue } from "./src/queues/email.queue";
import { closeIntegrationSyncQueue } from "./src/queues/integration-sync.queue";
import { closeIRadiusPushQueue } from "./src/queues/iradius-push.queue";
import { closeIRadiusSyncQueue } from "./src/queues/iradius-sync.queue";
import { closeLocationRequestQueue } from "./src/queues/location-request.queue";
import { closeMarketingSendQueue } from "./src/queues/marketing-send.queue";
import { closeOrgSetupQueue } from "./src/queues/org-setup.queue";
import { closeScheduledQueue } from "./src/queues/scheduled.queue";
import { closeTelegramLocationQueue } from "./src/queues/telegram-location.queue";
import { closeWatcherCheckQueue } from "./src/queues/watcher-check.queue";
import { closeWebhookQueue } from "./src/queues/webhook.queue";
import { closeWhatsAppReceiptQueue } from "./src/queues/whatsapp-receipt.queue";

/**
 * Gracefully shutdown all job queues and connections.
 * Call this during application shutdown for clean resource cleanup.
 */
export async function shutdownJobs(): Promise<void> {
	await Promise.allSettled([
		closeAiChatQueue(),
		closeBillingSyncQueue(),
		closeEmailQueue(),
		closeIRadiusPushQueue(),
		closeIRadiusSyncQueue(),
		closeIntegrationSyncQueue(),
		closeLocationRequestQueue(),
		closeMarketingSendQueue(),
		closeOrgSetupQueue(),
		closeScheduledQueue(),
		closeWatcherCheckQueue(),
		closeTelegramLocationQueue(),
		closeWhatsAppReceiptQueue(),
		closeWebhookQueue(),
	]);

	await closeConnection();
}
