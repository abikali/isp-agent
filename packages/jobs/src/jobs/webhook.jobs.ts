import { randomUUID } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { db } from "@repo/database";
import { getWebhookQueue } from "../queues/webhook.queue";
import type { WebhookJobData } from "../types";

export interface WebhookPayload {
	id: string;
	event: string;
	timestamp: string;
	data: unknown;
}

interface QueueWebhooksOptions {
	organizationId: string;
	event: string;
	data: unknown;
}

/**
 * Queue webhooks for an event to all subscribed endpoints in an organization
 */
export async function queueWebhooks(
	options: QueueWebhooksOptions,
): Promise<string[]> {
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
	const queue = getWebhookQueue();
	const jobIds: string[] = [];

	for (const webhook of webhooks) {
		// Create delivery record first
		const delivery = await db.webhookDelivery.create({
			data: {
				id: createId(),
				webhookId: webhook.id,
				event,
				payload: payload as object,
				attempts: 0,
			},
		});

		// Queue the job
		const job = await queue.add(`webhook-${event}`, {
			webhookId: webhook.id,
			deliveryId: delivery.id,
			url: webhook.url,
			secret: webhook.secret,
			payload: payloadString,
			event,
			organizationId,
		} satisfies WebhookJobData);

		jobIds.push(job.id ?? "");
	}

	return jobIds;
}

/**
 * Retry a failed webhook delivery
 */
export async function retryWebhookDelivery(
	deliveryId: string,
): Promise<string> {
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

	const queue = getWebhookQueue();
	const payloadString = JSON.stringify(delivery.payload);

	const job = await queue.add(`webhook-retry-${delivery.event}`, {
		webhookId: delivery.webhook.id,
		deliveryId: delivery.id,
		url: delivery.webhook.url,
		secret: delivery.webhook.secret,
		payload: payloadString,
		event: delivery.event,
		organizationId: delivery.webhook.organizationId,
	} satisfies WebhookJobData);

	return job.id ?? "";
}
