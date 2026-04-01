import { db, type Prisma } from "@repo/database";
import { logger } from "@repo/logs";
import { normalizePhone } from "@repo/utils";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { WHATSAPP_RECEIPT_QUEUE_NAME } from "../queues/whatsapp-receipt.queue";
import type {
	WhatsAppReceiptJobData,
	WhatsAppReceiptJobResult,
} from "../types";

interface ActivityLogEntry {
	action: string;
	status: "success" | "failed" | "skipped";
	statusCode?: number;
	error?: string;
	detail?: string;
	timestamp: string;
}

async function appendActivityLog(
	paymentId: string,
	entry: ActivityLogEntry,
): Promise<void> {
	const payment = await db.payment.findUnique({
		where: { id: paymentId },
		select: { activityLog: true },
	});
	const log = Array.isArray(payment?.activityLog)
		? (payment.activityLog as Prisma.JsonArray)
		: [];
	log.push(entry as unknown as Prisma.JsonValue);
	await db.payment.update({
		where: { id: paymentId },
		data: { activityLog: log },
	});
}

export function createWhatsAppReceiptWorker(): Worker<
	WhatsAppReceiptJobData,
	WhatsAppReceiptJobResult
> {
	return new Worker<WhatsAppReceiptJobData, WhatsAppReceiptJobResult>(
		WHATSAPP_RECEIPT_QUEUE_NAME,
		async (job) => {
			const { phone: rawPhone, paymentId, source = "auto" } = job.data;
			const actionLabel =
				source === "manual"
					? "whatsapp_receipt_manual"
					: "whatsapp_receipt";

			const token = process.env["WPBOX_TOKEN"];
			if (!token) {
				logger.warn("[WhatsApp Receipt] WPBOX_TOKEN not set, skipping");
				await appendActivityLog(paymentId, {
					action: actionLabel,
					status: "skipped",
					error: "WPBOX_TOKEN not set",
					detail: rawPhone,
					timestamp: new Date().toISOString(),
				});
				return { success: false };
			}

			const phone = normalizePhone(rawPhone);
			if (phone.length < 10) {
				logger.warn("[WhatsApp Receipt] Invalid phone number", {
					phone,
				});
				await appendActivityLog(paymentId, {
					action: actionLabel,
					status: "skipped",
					error: "Invalid phone number",
					detail: phone,
					timestamp: new Date().toISOString(),
				});
				return { success: false };
			}

			const payload = {
				token,
				phone,
				template_name: "success_payment_url",
				template_language: "en_US",
				components: [
					{
						type: "button",
						sub_type: "url",
						index: "0",
						parameters: [
							{
								type: "text",
								text: paymentId,
							},
						],
					},
				],
			};

			const response = await fetch(
				"https://saltimarketing.com/api/wpbox/sendtemplatemessage",
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
					signal: AbortSignal.timeout(15000),
				},
			);

			if (!response.ok) {
				// Throw on transient errors so BullMQ retries with backoff
				if (response.status >= 500) {
					// Only log on final attempt to avoid cluttering the log
					const maxAttempts = job.opts.attempts ?? 3;
					if (job.attemptsMade + 1 >= maxAttempts) {
						await appendActivityLog(paymentId, {
							action: actionLabel,
							status: "failed",
							statusCode: response.status,
							error: `Server error after ${maxAttempts} attempts`,
							detail: phone,
							timestamp: new Date().toISOString(),
						});
					}
					throw new Error(
						`WPBox API returned ${response.status} for ${phone}`,
					);
				}
				logger.warn("[WhatsApp Receipt] API returned non-OK", {
					status: response.status,
					phone,
				});
				await appendActivityLog(paymentId, {
					action: actionLabel,
					status: "failed",
					statusCode: response.status,
					error: `API returned ${response.status}`,
					detail: phone,
					timestamp: new Date().toISOString(),
				});
				return { success: false };
			}

			logger.info("[WhatsApp Receipt] Sent successfully", {
				phone,
				paymentId,
			});

			// Update receipt status and log in one write
			const payment = await db.payment.findUnique({
				where: { id: paymentId },
				select: { activityLog: true },
			});
			const log = Array.isArray(payment?.activityLog)
				? (payment.activityLog as Prisma.JsonArray)
				: [];
			log.push({
				action: actionLabel,
				status: "success",
				statusCode: response.status,
				detail: phone,
				timestamp: new Date().toISOString(),
			} as unknown as Prisma.JsonValue);

			await db.payment.update({
				where: { id: paymentId },
				data: {
					receiptSent: true,
					receiptSentAt: new Date(),
					activityLog: log,
				},
			});

			return { success: true };
		},
		{
			connection: getRedisConnection(),
			concurrency: 5,
		},
	);
}
