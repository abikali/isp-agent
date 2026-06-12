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
			const { employeeId, organizationId, text } = job.data;

			const botToken = process.env["TELEGRAM_COLLECTOR_BOT_TOKEN"];
			if (!botToken) {
				logger.warn(
					"[Telegram Notify] TELEGRAM_COLLECTOR_BOT_TOKEN not set, skipping",
				);
				return { success: false };
			}

			const employee = await db.employee.findFirst({
				where: { id: employeeId, organizationId },
				select: { telegramChatId: true },
			});

			if (!employee?.telegramChatId) {
				logger.warn(
					"[Telegram Notify] No Telegram chat ID for employee",
					{
						employeeId,
					},
				);
				return { success: false };
			}

			const result = await telegram.sendTextMessage(
				botToken,
				employee.telegramChatId,
				text,
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
