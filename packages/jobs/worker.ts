import { logger } from "@repo/logs";
import { closeConnection } from "./src/connection";
import { setupScheduledJobs } from "./src/queues/scheduled.queue";
import { createEmailWorker } from "./src/workers/email.worker";
import { createIntegrationSyncWorker } from "./src/workers/integration-sync.worker";
import { createScheduledWorker } from "./src/workers/scheduled.worker";
import { createWebhookWorker } from "./src/workers/webhook.worker";

async function main() {
	logger.info("Starting job workers...");

	// Create workers
	const emailWorker = createEmailWorker();
	const webhookWorker = createWebhookWorker();
	const scheduledWorker = createScheduledWorker();
	const integrationSyncWorker = createIntegrationSyncWorker();

	// Setup scheduled job definitions (cron jobs)
	await setupScheduledJobs();

	logger.info("All workers started successfully", {
		workers: ["email", "webhook", "scheduled", "integration-sync"],
	});

	// Graceful shutdown
	const shutdown = async (signal: string) => {
		logger.info(`Received ${signal}, shutting down workers...`);

		await Promise.all([
			emailWorker.close(),
			webhookWorker.close(),
			scheduledWorker.close(),
			integrationSyncWorker.close(),
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
