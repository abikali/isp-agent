import { createHmac } from "node:crypto";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { WEBHOOK_QUEUE_NAME } from "../queues/webhook.queue";
import type { WebhookJobData, WebhookJobResult } from "../types";

function signWebhookPayload(payload: string, secret: string): string {
	return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createWebhookWorker(): Worker<
	WebhookJobData,
	WebhookJobResult
> {
	return new Worker<WebhookJobData, WebhookJobResult>(
		WEBHOOK_QUEUE_NAME,
		async (job: Job<WebhookJobData>) => {
			const { webhookId, deliveryId, url, secret, payload, event } =
				job.data;

			logger.info(`Processing webhook job ${job.id}`, {
				webhookId,
				event,
				url,
			});

			try {
				const signature = signWebhookPayload(payload, secret);

				const response = await fetch(url, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-Webhook-Signature": signature,
						"X-Webhook-Id": deliveryId,
					},
					body: payload,
					signal: AbortSignal.timeout(30000),
				});

				const statusCode = response.status;
				const responseText = await response.text().catch(() => "");

				// Update delivery record
				await db.webhookDelivery.update({
					where: { id: deliveryId },
					data: {
						attempts: job.attemptsMade + 1,
						statusCode,
						response: responseText.substring(0, 1000), // Limit response size
						deliveredAt: response.ok ? new Date() : null,
					},
				});

				if (!response.ok) {
					throw new Error(`Webhook failed with status ${statusCode}`);
				}

				logger.info("Webhook delivered successfully", {
					deliveryId,
					statusCode,
				});

				return { success: true, statusCode, response: responseText };
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : "Unknown error";

				// Update delivery record with error
				await db.webhookDelivery.update({
					where: { id: deliveryId },
					data: {
						attempts: job.attemptsMade + 1,
						response: errorMessage,
					},
				});

				logger.error(`Webhook job ${job.id} failed`, {
					error,
					deliveryId,
				});
				throw error;
			}
		},
		{
			connection: getRedisConnection(),
			concurrency: 10,
		},
	);
}
