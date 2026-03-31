import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { normalizePhone } from "@repo/utils";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { WHATSAPP_RECEIPT_QUEUE_NAME } from "../queues/whatsapp-receipt.queue";
import type {
	WhatsAppReceiptJobData,
	WhatsAppReceiptJobResult,
} from "../types";

export function createWhatsAppReceiptWorker(): Worker<
	WhatsAppReceiptJobData,
	WhatsAppReceiptJobResult
> {
	return new Worker<WhatsAppReceiptJobData, WhatsAppReceiptJobResult>(
		WHATSAPP_RECEIPT_QUEUE_NAME,
		async (job) => {
			const { phone: rawPhone, paymentId } = job.data;

			const token = process.env["WPBOX_TOKEN"];
			if (!token) {
				logger.warn("[WhatsApp Receipt] WPBOX_TOKEN not set, skipping");
				return { success: false };
			}

			const phone = normalizePhone(rawPhone);
			if (phone.length < 10) {
				logger.warn("[WhatsApp Receipt] Invalid phone number", {
					phone,
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
				logger.warn("[WhatsApp Receipt] API returned non-OK", {
					status: response.status,
					phone,
				});
				return { success: false };
			}

			logger.info("[WhatsApp Receipt] Sent successfully", {
				phone,
				paymentId,
			});

			await db.payment.update({
				where: { id: paymentId },
				data: {
					receiptSent: true,
					receiptSentAt: new Date(),
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
