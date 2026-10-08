// Connection
export { closeConnection, getRedisConnection } from "./src/connection";
// Jobs
export { queueAiChatRetry } from "./src/jobs/ai-chat.jobs";
export {
	cancelFollowUp,
	countRecentFollowUps,
	scheduleFollowUp,
} from "./src/jobs/ai-followup.jobs";
export {
	cancelTeammateWait,
	clearAwaitingHuman,
	markAwaitingHuman,
	TEAMMATE_ALERT_AFTER_MS,
	TEAMMATE_BOT_TAKEOVER_AFTER_MS,
} from "./src/jobs/ai-teammate-wait.jobs";
export { queueBillingSync } from "./src/jobs/billing-sync.jobs";
export { queueCustomerNotifications } from "./src/jobs/customer-notify.jobs";
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
export {
	queueMarketingSend,
	rescheduleMarketingSend,
} from "./src/jobs/marketing-send.jobs";
export { queueOrgSetup } from "./src/jobs/org-setup.jobs";
export { queueSaltiInbound } from "./src/jobs/salti-inbound.jobs";
export {
	cancelTaskReminder,
	scheduleTaskReminder,
} from "./src/jobs/task-reminder.jobs";
export { queueTelegramLocationNotify } from "./src/jobs/telegram-location.jobs";
export { queueTelegramNotify } from "./src/jobs/telegram-notify.jobs";
export { queueWatcherCheck } from "./src/jobs/watcher-check.jobs";
export {
	queueWebhooks,
	retryWebhookDelivery,
	type WebhookPayload,
} from "./src/jobs/webhook.jobs";
export {
	queueWhatsAppReceipt,
	queueWhatsAppReferralReward,
} from "./src/jobs/whatsapp-receipt.jobs";
export { queueWhatsAppTemplateRetry } from "./src/jobs/whatsapp-template.jobs";
export {
	draftFollowUp,
	type FollowUpRunResult,
	runFollowUp,
} from "./src/lib/ai-follow-up";
export {
	captureFollowUpReply,
	runBotFollowUpSweep,
	settleCheckBackReplies,
} from "./src/lib/bot-follow-ups";
export { summarizeConversation } from "./src/lib/conversation-summaries";
export {
	buildNotificationRows,
	type CustomerNotificationChannel,
	type CustomerNotificationKind,
	customerNotificationsAllowed,
	formatLocalPhone,
	orgContactCandidates,
	pickContactPhone,
	WHATSAPP_TEMPLATES,
} from "./src/lib/customer-notifications";
export {
	LEAD_CUSTOMER_SELECT,
	leadFieldsFromCustomer,
	pruneNonFiberLeads,
	runFiberSignalSweep,
} from "./src/lib/fiber-signals";
export {
	type BridgeProbeStatus,
	probeIRadiusBridge,
} from "./src/lib/iradius-bridge-probe";
// Shared helper re-exported for the API layer (single-customer inline sends)
export {
	type CreateLocationRequestResult,
	runCreateLocationRequest,
} from "./src/lib/location-request-helper";
export {
	loadOutreachContext,
	OUTREACH_DEFINITIONS,
	type OutreachType,
	outreachTemplateName,
	renderOutreachBody,
	type ScheduleOutreachInput,
	type ScheduleOutreachResult,
	scheduleOutreach,
} from "./src/lib/outreach";
export { reconcileOrphanedAiChats } from "./src/lib/reconcile-orphaned-chats";
export { sendVoiceReply } from "./src/lib/voice-reply";
// WPBox template senders (shared; API layer imports via @repo/jobs)
export {
	sendWhatsAppDealerAccountUpdate,
	sendWhatsAppLocationRequest,
	sendWhatsAppMaintenanceVisit,
	sendWhatsAppReceipt,
} from "./src/lib/wpbox";
// Queues
export {
	AI_CHAT_QUEUE_NAME,
	closeAiChatQueue,
	getAiChatQueue,
} from "./src/queues/ai-chat.queue";
export {
	AI_FOLLOWUP_QUEUE_NAME,
	closeAiFollowUpQueue,
	getAiFollowUpQueue,
} from "./src/queues/ai-followup.queue";
export {
	BILLING_SYNC_QUEUE_NAME,
	closeBillingSyncQueue,
	getBillingSyncQueue,
} from "./src/queues/billing-sync.queue";
export {
	CUSTOMER_NOTIFY_QUEUE_NAME,
	closeCustomerNotifyQueue,
	getCustomerNotifyQueue,
} from "./src/queues/customer-notify.queue";
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
	closeSaltiInboundQueue,
	getSaltiInboundQueue,
	SALTI_INBOUND_QUEUE_NAME,
} from "./src/queues/salti-inbound.queue";
export {
	closeScheduledQueue,
	getScheduledQueue,
	SCHEDULED_QUEUE_NAME,
	setupScheduledJobs,
} from "./src/queues/scheduled.queue";
export {
	closeTaskReminderQueue,
	getTaskReminderQueue,
	TASK_REMINDER_QUEUE_NAME,
} from "./src/queues/task-reminder.queue";
export {
	closeTelegramLocationQueue,
	getTelegramLocationQueue,
	TELEGRAM_LOCATION_QUEUE_NAME,
} from "./src/queues/telegram-location.queue";
export {
	closeTelegramNotifyQueue,
	getTelegramNotifyQueue,
	TELEGRAM_NOTIFY_QUEUE_NAME,
} from "./src/queues/telegram-notify.queue";
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
export {
	closeWhatsAppTemplateQueue,
	getWhatsAppTemplateQueue,
	WHATSAPP_TEMPLATE_QUEUE_NAME,
} from "./src/queues/whatsapp-template.queue";
// Types
export type {
	AiChatJobData,
	AiChatJobResult,
	AiFollowUpJobData,
	AiFollowUpJobResult,
	BillingSyncJobData,
	BillingSyncJobResult,
	CustomerNotifyJobData,
	CustomerNotifyJobResult,
	DealerNoticeStatus,
	DealerWhatsAppNotice,
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
	SaltiInboundJobData,
	SaltiInboundJobResult,
	ScheduledJobData,
	ScheduledJobResult,
	TaskReminderJobData,
	TaskReminderJobResult,
	TelegramLocationJobData,
	TelegramLocationJobResult,
	TelegramNotifyJobData,
	TelegramNotifyJobResult,
	WatcherCheckJobData,
	WatcherCheckJobResult,
	WebhookJobData,
	WebhookJobResult,
	WhatsAppReceiptJobData,
	WhatsAppReceiptJobResult,
	WhatsAppTemplateJobData,
	WhatsAppTemplateJobResult,
} from "./src/types";
// Workers (for worker process)
export { createAiChatWorker } from "./src/workers/ai-chat.worker";
export { createAiFollowUpWorker } from "./src/workers/ai-followup.worker";
export { createBillingSyncWorker } from "./src/workers/billing-sync.worker";
export { createCustomerNotifyWorker } from "./src/workers/customer-notify.worker";
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
	type PlanConnectionInfo,
	resolveSyncDealers,
	type SyncLookupMaps,
} from "./src/workers/iradius-sync-helpers";
export { createLocationRequestWorker } from "./src/workers/location-request.worker";
export { createMarketingSendWorker } from "./src/workers/marketing-send.worker";
export { createOrgSetupWorker } from "./src/workers/org-setup.worker";
export { createSaltiInboundWorker } from "./src/workers/salti-inbound.worker";
export { createScheduledWorker } from "./src/workers/scheduled.worker";
export {
	createTaskReminderWorker,
	type TaskReminderWorkerDeps,
} from "./src/workers/task-reminder.worker";
export { createTelegramLocationWorker } from "./src/workers/telegram-location.worker";
export { createTelegramNotifyWorker } from "./src/workers/telegram-notify.worker";
export {
	createWatcherCheckWorker,
	type WatcherCheckWorkerDeps,
	type WatcherNotificationPayload,
} from "./src/workers/watcher-check.worker";
export { createWebhookWorker } from "./src/workers/webhook.worker";
export { createWhatsAppReceiptWorker } from "./src/workers/whatsapp-receipt.worker";
export { createWhatsAppTemplateWorker } from "./src/workers/whatsapp-template.worker";

// Cleanup utilities
import { closeConnection } from "./src/connection";
import { closeAiChatQueue } from "./src/queues/ai-chat.queue";
import { closeAiFollowUpQueue } from "./src/queues/ai-followup.queue";
import { closeBillingSyncQueue } from "./src/queues/billing-sync.queue";
import { closeCustomerNotifyQueue } from "./src/queues/customer-notify.queue";
import { closeEmailQueue } from "./src/queues/email.queue";
import { closeIntegrationSyncQueue } from "./src/queues/integration-sync.queue";
import { closeIRadiusPushQueue } from "./src/queues/iradius-push.queue";
import { closeIRadiusSyncQueue } from "./src/queues/iradius-sync.queue";
import { closeLocationRequestQueue } from "./src/queues/location-request.queue";
import { closeMarketingSendQueue } from "./src/queues/marketing-send.queue";
import { closeOrgSetupQueue } from "./src/queues/org-setup.queue";
import { closeScheduledQueue } from "./src/queues/scheduled.queue";
import { closeTaskReminderQueue } from "./src/queues/task-reminder.queue";
import { closeTelegramLocationQueue } from "./src/queues/telegram-location.queue";
import { closeTelegramNotifyQueue } from "./src/queues/telegram-notify.queue";
import { closeWatcherCheckQueue } from "./src/queues/watcher-check.queue";
import { closeWebhookQueue } from "./src/queues/webhook.queue";
import { closeWhatsAppReceiptQueue } from "./src/queues/whatsapp-receipt.queue";
import { closeWhatsAppTemplateQueue } from "./src/queues/whatsapp-template.queue";

/**
 * Gracefully shutdown all job queues and connections.
 * Call this during application shutdown for clean resource cleanup.
 */
export async function shutdownJobs(): Promise<void> {
	await Promise.allSettled([
		closeAiChatQueue(),
		closeAiFollowUpQueue(),
		closeBillingSyncQueue(),
		closeCustomerNotifyQueue(),
		closeEmailQueue(),
		closeIRadiusPushQueue(),
		closeIRadiusSyncQueue(),
		closeIntegrationSyncQueue(),
		closeLocationRequestQueue(),
		closeMarketingSendQueue(),
		closeOrgSetupQueue(),
		closeScheduledQueue(),
		closeTaskReminderQueue(),
		closeWatcherCheckQueue(),
		closeTelegramLocationQueue(),
		closeTelegramNotifyQueue(),
		closeWhatsAppReceiptQueue(),
		closeWhatsAppTemplateQueue(),
		closeWebhookQueue(),
	]);

	await closeConnection();
}
