import { telegram } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { TELEGRAM_LOCATION_QUEUE_NAME } from "../queues/telegram-location.queue";
import type {
	TelegramLocationJobData,
	TelegramLocationJobResult,
} from "../types";

export function createTelegramLocationWorker(): Worker<
	TelegramLocationJobData,
	TelegramLocationJobResult
> {
	return new Worker<TelegramLocationJobData, TelegramLocationJobResult>(
		TELEGRAM_LOCATION_QUEUE_NAME,
		async (job) => {
			const { employeeId, customerId, organizationId } = job.data;

			const botToken = process.env["TELEGRAM_COLLECTOR_BOT_TOKEN"];
			if (!botToken) {
				logger.warn(
					"[Telegram Location] TELEGRAM_COLLECTOR_BOT_TOKEN not set, skipping",
				);
				return { success: false };
			}

			const [employee, customer] = await Promise.all([
				db.employee.findFirst({
					where: { id: employeeId },
					select: { telegramChatId: true },
				}),
				db.customer.findFirst({
					where: {
						id: customerId,
						organizationId,
					},
					select: {
						firstName: true,
						lastName: true,
						username: true,
						address: true,
						groupName: true,
					},
				}),
			]);

			if (!customer) {
				logger.warn("[Telegram Location] Customer not found", {
					customerId,
				});
				return { success: false };
			}

			if (!employee?.telegramChatId) {
				logger.warn(
					"[Telegram Location] No Telegram chat ID for employee",
					{ employeeId },
				);
				return { success: false };
			}

			const customerName =
				[customer.firstName, customer.lastName]
					.filter(Boolean)
					.join(" ") ||
				customer.username ||
				"Unknown";

			const lines = [
				`📌 Location needed for: ${customerName}`,
				...(customer.groupName ? [`Group: ${customer.groupName}`] : []),
				...(customer.address ? [`Address: ${customer.address}`] : []),
				"",
				"Please visit this customer and share their location.",
			];

			const result = await telegram.sendTextMessage(
				botToken,
				employee.telegramChatId,
				lines.join("\n"),
			);

			if (!result.success) {
				throw new Error("Telegram sendTextMessage failed");
			}

			logger.info("[Telegram Location] Sent successfully", {
				customerId,
				employeeId,
			});

			return { success: true };
		},
		{
			connection: getRedisConnection(),
			concurrency: 5,
		},
	);
}
