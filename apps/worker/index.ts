import { initRateLimiter } from "@repo/ai";
import {
	closeConnection,
	createAiChatWorker,
	createBillingSyncWorker,
	createEmailWorker,
	createIntegrationSyncWorker,
	createIRadiusPushWorker,
	createIRadiusSyncWorker,
	createLocationRequestWorker,
	createMarketingSendWorker,
	createOrgSetupWorker,
	createScheduledWorker,
	createTelegramLocationWorker,
	createTelegramNotifyWorker,
	createWatcherCheckWorker,
	createWebhookWorker,
	createWhatsAppReceiptWorker,
	getRedisConnection,
	reconcileOrphanedAiChats,
	setupScheduledJobs,
} from "@repo/jobs";
import { logger } from "@repo/logs";
import { sendOrganizationNotification } from "@repo/notifications";

async function main() {
	logger.info("Starting job workers...");

	// Initialize WhatsApp send rate limiter with the shared Redis connection
	initRateLimiter(getRedisConnection());

	// Create workers
	const aiChatWorker = createAiChatWorker();
	const billingSyncWorker = createBillingSyncWorker();
	const emailWorker = createEmailWorker();
	const webhookWorker = createWebhookWorker();
	const scheduledWorker = createScheduledWorker();
	const iRadiusSyncWorker = createIRadiusSyncWorker();
	const iRadiusPushWorker = createIRadiusPushWorker();
	const integrationSyncWorker = createIntegrationSyncWorker();
	const orgSetupWorker = createOrgSetupWorker();
	const telegramLocationWorker = createTelegramLocationWorker();
	const telegramNotifyWorker = createTelegramNotifyWorker();
	const locationRequestWorker = createLocationRequestWorker();
	const marketingSendWorker = createMarketingSendWorker();
	const whatsAppReceiptWorker = createWhatsAppReceiptWorker();
	const watcherCheckWorker = createWatcherCheckWorker({
		sendOrganizationNotification: (organizationId, payload) =>
			sendOrganizationNotification(organizationId, payload),
	});

	// Setup scheduled job definitions (cron jobs)
	await setupScheduledJobs();

	// Recover conversations whose generation died mid-flight (e.g. a deploy
	// killed the web process after the user message was stored).
	reconcileOrphanedAiChats().catch((error) => {
		logger.error("Orphaned AI chat reconciliation failed", { error });
	});

	logger.info("All workers started successfully", {
		workers: [
			"ai-chat",
			"billing-sync",
			"email",
			"iradius-sync",
			"iradius-push",
			"webhook",
			"scheduled",
			"integration-sync",
			"org-setup",
			"watcher-check",
			"telegram-location",
			"telegram-notify",
			"location-request",
			"marketing-send",
			"whatsapp-receipt",
		],
	});

	// Graceful shutdown
	const shutdown = async (signal: string) => {
		logger.info(`Received ${signal}, shutting down workers...`);

		await Promise.all([
			aiChatWorker.close(),
			billingSyncWorker.close(),
			emailWorker.close(),
			iRadiusSyncWorker.close(),
			iRadiusPushWorker.close(),
			webhookWorker.close(),
			scheduledWorker.close(),
			integrationSyncWorker.close(),
			orgSetupWorker.close(),
			watcherCheckWorker.close(),
			telegramLocationWorker.close(),
			telegramNotifyWorker.close(),
			locationRequestWorker.close(),
			marketingSendWorker.close(),
			whatsAppReceiptWorker.close(),
		]);

		await closeConnection();
		logger.info("Workers shut down gracefully");
		process.exit(0);
	};

	process.on("SIGTERM", () => shutdown("SIGTERM"));
	process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
	logger.error("Worker process failed", { error });
	process.exit(1);
});
