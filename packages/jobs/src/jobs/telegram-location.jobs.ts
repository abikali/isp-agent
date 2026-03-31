import { getTelegramLocationQueue } from "../queues/telegram-location.queue";
import type { TelegramLocationJobData } from "../types";

export async function queueTelegramLocationNotify(
	data: TelegramLocationJobData,
): Promise<string> {
	const queue = getTelegramLocationQueue();
	const job = await queue.add("notify-location-needed", data);
	return job.id ?? "";
}
