import { getWhatsAppReceiptQueue } from "../queues/whatsapp-receipt.queue";
import type { WhatsAppReceiptJobData } from "../types";

export async function queueWhatsAppReceipt(
	data: WhatsAppReceiptJobData,
): Promise<string> {
	const queue = getWhatsAppReceiptQueue();
	const job = await queue.add("send-receipt", data);
	return job.id ?? "";
}
