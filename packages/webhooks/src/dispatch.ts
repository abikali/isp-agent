import { randomUUID } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import type { WebhookEvent, WebhookPayload } from "./events";
import { signWebhookPayload } from "./sign";

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

interface DispatchOptions {
	organizationId: string;
	event: WebhookEvent;
	data: unknown;
}

interface WebhookResult {
	webhookId: string;
	success: boolean;
	statusCode?: number;
	error?: string;
}

/**
 * Dispatch webhooks for an event to all subscribed endpoints in an organization
 */
export async function dispatchWebhooks(
	options: DispatchOptions,
): Promise<WebhookResult[]> {
	const { organizationId, event, data } = options;

	// Find all enabled webhooks for this organization that subscribe to this event
	const webhooks = await db.webhook.findMany({
		where: {
			organizationId,
			enabled: true,
			events: {
				has: event,
			},
		},
	});

	if (webhooks.length === 0) {
		return [];
	}

	// Build the payload
	const payload: WebhookPayload = {
		id: randomUUID(),
		event,
		timestamp: new Date().toISOString(),
		data,
	};

	const payloadString = JSON.stringify(payload);

	// Dispatch to each webhook
	const results = await Promise.all(
		webhooks.map((webhook) =>
			sendWebhook(webhook.id, webhook.url, webhook.secret, payloadString),
		),
	);

	return results;
}

/**
 * Send a webhook to a single endpoint with retry logic
 */
async function sendWebhook(
	webhookId: string,
	url: string,
	secret: string,
	payloadString: string,
): Promise<WebhookResult> {
	// Create delivery record
	const delivery = await db.webhookDelivery.create({
		data: {
			id: createId(),
			webhookId,
			event: JSON.parse(payloadString).event,
			payload: JSON.parse(payloadString),
			attempts: 0,
		},
	});

	let lastError: string | undefined;
	let statusCode: number | undefined;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		if (attempt > 0) {
			// Wait before retry
			await sleep(RETRY_DELAYS[attempt - 1] ?? 30000);
		}

		try {
			const signature = signWebhookPayload(payloadString, secret);

			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Webhook-Signature": signature,
					"X-Webhook-Id": delivery.id,
				},
				body: payloadString,
				signal: AbortSignal.timeout(30000), // 30 second timeout
			});

			statusCode = response.status;

			// Update delivery record
			await db.webhookDelivery.update({
				where: { id: delivery.id },
				data: {
					attempts: attempt + 1,
					statusCode,
					response: await response.text().catch(() => ""),
					deliveredAt: response.ok ? new Date() : null,
				},
			});

			if (response.ok) {
				return {
					webhookId,
					success: true,
					statusCode,
				};
			}

			lastError = `HTTP ${statusCode}`;
		} catch (error) {
			lastError =
				error instanceof Error ? error.message : "Unknown error";

			// Update delivery record with error
			await db.webhookDelivery.update({
				where: { id: delivery.id },
				data: {
					attempts: attempt + 1,
					response: lastError,
				},
			});
		}
	}

	const result: WebhookResult = {
		webhookId,
		success: false,
	};
	if (statusCode !== undefined) {
		result.statusCode = statusCode;
	}
	if (lastError !== undefined) {
		result.error = lastError;
	}
	return result;
}

/**
 * Retry a failed webhook delivery
 */
export async function retryWebhookDelivery(
	deliveryId: string,
): Promise<WebhookResult> {
	const delivery = await db.webhookDelivery.findUnique({
		where: { id: deliveryId },
		include: { webhook: true },
	});

	if (!delivery) {
		throw new Error("Delivery not found");
	}

	if (delivery.deliveredAt) {
		throw new Error("Delivery already succeeded");
	}

	const payloadString = JSON.stringify(delivery.payload);

	return sendWebhook(
		delivery.webhook.id,
		delivery.webhook.url,
		delivery.webhook.secret,
		payloadString,
	);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
