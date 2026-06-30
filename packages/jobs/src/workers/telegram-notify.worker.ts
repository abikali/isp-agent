import { telegram } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { TELEGRAM_NOTIFY_QUEUE_NAME } from "../queues/telegram-notify.queue";
import type { TelegramNotifyJobData, TelegramNotifyJobResult } from "../types";

export function createTelegramNotifyWorker(): Worker<
	TelegramNotifyJobData,
	TelegramNotifyJobResult
> {
	return new Worker<TelegramNotifyJobData, TelegramNotifyJobResult>(
		TELEGRAM_NOTIFY_QUEUE_NAME,
		async (job) => {
			const { employeeId, chatId, organizationId, text, parseMode } =
				job.data;

			const botToken = process.env["TELEGRAM_COLLECTOR_BOT_TOKEN"];
			if (!botToken) {
				logger.warn(
					"[Telegram Notify] TELEGRAM_COLLECTOR_BOT_TOKEN not set, skipping",
				);
				return { success: false };
			}

			// A raw chatId (admin alerts) takes precedence; otherwise resolve it
			// from the employee record.
			let targetChatId = chatId ?? null;
			if (!targetChatId && employeeId) {
				const employee = await db.employee.findFirst({
					where: { id: employeeId, organizationId },
					select: { telegramChatId: true },
				});
				targetChatId = employee?.telegramChatId ?? null;
			}

			if (!targetChatId) {
				logger.warn(
					"[Telegram Notify] No Telegram chat ID to send to",
					{
						employeeId,
					},
				);
				return { success: false };
			}

			const result = await telegram.sendTextMessage(
				botToken,
				targetChatId,
				text,
				parseMode ? { parseMode } : undefined,
			);

			if (!result.success) {
				throw new Error("Telegram sendTextMessage failed");
			}

			return { success: true };
		},
		{
			connection: getRedisConnection(),
			concurrency: 5,
		},
	);
}
