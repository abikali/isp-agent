import { getWhatsAppTemplateQueue } from "../queues/whatsapp-template.queue";
import type { WhatsAppTemplateJobData } from "../types";

/**
 * Retry a template send that failed transiently inline. The first attempt
 * waits a little so a WPBox blip has time to clear.
 */
export async function queueWhatsAppTemplateRetry(
	data: WhatsAppTemplateJobData,
): Promise<string> {
	const queue = getWhatsAppTemplateQueue();
	const job = await queue.add(data.kind, data, { delay: 15_000 });
	return job.id ?? "";
}
