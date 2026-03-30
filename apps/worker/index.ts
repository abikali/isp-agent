import { initRateLimiter } from "@repo/ai";
import {
	closeConnection,
	createAiChatWorker,
	createBillingSyncWorker,
	createEmailWorker,
	createIntegrationSyncWorker,
	createIRadiusSyncWorker,
	createOrgSetupWorker,
	createScheduledWorker,
	createWatcherCheckWorker,
	createWebhookWorker,
	createWhatsAppReceiptWorker,
	getRedisConnection,
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
	const integrationSyncWorker = createIntegrationSyncWorker();
	const orgSetupWorker = createOrgSetupWorker();
	const whatsAppReceiptWorker = createWhatsAppReceiptWorker();
	const watcherCheckWorker = createWatcherCheckWorker({
		sendOrganizationNotification: (organizationId, payload) =>
			sendOrganizationNotification(organizationId, payload),
	});

	// Setup scheduled job definitions (cron jobs)
	await setupScheduledJobs();

	logger.info("All workers started successfully", {
		workers: [
			"ai-chat",
			"billing-sync",
			"email",
			"iradius-sync",
			"webhook",
			"scheduled",
			"integration-sync",
			"org-setup",
			"watcher-check",
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
			webhookWorker.close(),
			scheduledWorker.close(),
			integrationSyncWorker.close(),
			orgSetupWorker.close(),
			watcherCheckWorker.close(),
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
