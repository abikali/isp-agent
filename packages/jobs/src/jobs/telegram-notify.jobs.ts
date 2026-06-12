import { getTelegramNotifyQueue } from "../queues/telegram-notify.queue";
import type { TelegramNotifyJobData } from "../types";

export async function queueTelegramNotify(
	data: TelegramNotifyJobData,
): Promise<string> {
	const queue = getTelegramNotifyQueue();
	const job = await queue.add("notify-employee", data);
	return job.id ?? "";
}
