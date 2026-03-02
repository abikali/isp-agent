import { initRateLimiter } from "@repo/ai";
import {
	closeConnection,
	createAiChatWorker,
	createEmailWorker,
	createIntegrationSyncWorker,
	createScheduledWorker,
	createWatcherCheckWorker,
	createWebhookWorker,
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
	const emailWorker = createEmailWorker();
	const webhookWorker = createWebhookWorker();
	const scheduledWorker = createScheduledWorker();
	const integrationSyncWorker = createIntegrationSyncWorker();
	const watcherCheckWorker = createWatcherCheckWorker({
		sendOrganizationNotification: (organizationId, payload) =>
			sendOrganizationNotification(organizationId, payload),
	});

	// Setup scheduled job definitions (cron jobs)
	await setupScheduledJobs();

	logger.info("All workers started successfully", {
		workers: [
			"ai-chat",
			"email",
			"webhook",
			"scheduled",
			"integration-sync",
			"watcher-check",
		],
	});

	// Graceful shutdown
	const shutdown = async (signal: string) => {
		logger.info(`Received ${signal}, shutting down workers...`);

		await Promise.all([
			aiChatWorker.close(),
			emailWorker.close(),
			webhookWorker.close(),
			scheduledWorker.close(),
			integrationSyncWorker.close(),
			watcherCheckWorker.close(),
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
