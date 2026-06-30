import { telegram } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { tgItalic, tgMessage } from "@repo/utils";
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

			const text = tgMessage({
				icon: "📌",
				title: "Location needed",
				fields: [
					{ icon: "👤", value: customerName },
					customer.username
						? {
								icon: "🆔",
								label: "Username",
								value: customer.username,
								copyable: true,
							}
						: null,
					customer.groupName
						? {
								icon: "🗂",
								label: "Group",
								value: customer.groupName,
							}
						: null,
					customer.address
						? {
								icon: "🏠",
								label: "Address",
								value: customer.address,
							}
						: null,
				],
				footer: tgItalic(
					"Please visit this customer and share their location.",
				),
			});

			const result = await telegram.sendTextMessage(
				botToken,
				employee.telegramChatId,
				text,
				{ parseMode: "HTML" },
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
