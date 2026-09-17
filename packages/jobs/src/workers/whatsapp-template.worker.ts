import { db, type Prisma } from "@repo/database";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { getWorkerConcurrency } from "../lib/worker-concurrency";
import { sendWhatsAppDealerAccountUpdate } from "../lib/wpbox";
import { WHATSAPP_TEMPLATE_QUEUE_NAME } from "../queues/whatsapp-template.queue";
import type {
	DealerWhatsAppNotice,
	WhatsAppTemplateJobData,
	WhatsAppTemplateJobResult,
} from "../types";

async function saveDealerNotice(
	dealerAccountId: string,
	notice: DealerWhatsAppNotice,
): Promise<void> {
	await db.ispDealerAccount.update({
		where: { id: dealerAccountId },
		data: {
			whatsappNotice: notice as unknown as Prisma.InputJsonValue,
		},
	});
}

/**
 * Retries WPBox template sends that failed transiently when first tried
 * inline (5xx, 429, timeout). Writes the final outcome back to the row the
 * message is about so staff see "sent" or "failed" instead of "retrying".
 */
export function createWhatsAppTemplateWorker(): Worker<
	WhatsAppTemplateJobData,
	WhatsAppTemplateJobResult
> {
	return new Worker<WhatsAppTemplateJobData, WhatsAppTemplateJobResult>(
		WHATSAPP_TEMPLATE_QUEUE_NAME,
		async (job) => {
			const { dealerAccountId, phone, params } = job.data;
			const result = await sendWhatsAppDealerAccountUpdate({
				phone,
				params,
				dealerAccountId,
			});
			const base = {
				phone: result.phone,
				params,
				updatedAt: new Date().toISOString(),
			};

			if (result.ok) {
				await saveDealerNotice(dealerAccountId, {
					...base,
					status: "sent",
					error: null,
					messageId: result.messageId,
				});
				return { success: true };
			}

			const maxAttempts = job.opts.attempts ?? 1;
			if (result.retriable && job.attemptsMade + 1 < maxAttempts) {
				throw new Error(
					`WPBox retry: ${result.error} for ${result.phone}`,
				);
			}

			await saveDealerNotice(dealerAccountId, {
				...base,
				status: "failed",
				error: result.retriable
					? `${result.error} after ${maxAttempts} retries`
					: result.error,
				messageId: null,
			});
			return { success: false };
		},
		{
			connection: getRedisConnection(),
			concurrency: getWorkerConcurrency(
				"WHATSAPP_TEMPLATE_WORKER_CONCURRENCY",
				5,
			),
		},
	);
}
