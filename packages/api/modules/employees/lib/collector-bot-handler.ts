import { telegram } from "@repo/ai";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { tgBold, tgEscape } from "@repo/utils";

/**
 * Inbound webhook for the collector/worker Telegram bot
 * (`TELEGRAM_COLLECTOR_BOT_TOKEN`). Its only job today is the "Connect
 * Telegram" deep-link flow: a worker taps `https://t.me/<bot>?start=<token>`,
 * Telegram delivers `/start <token>`, and we resolve `<token>` to the employee
 * that minted it and store their real chat id. Everything else is ignored.
 *
 * Always returns 200 — a non-200 makes Telegram retry the same update.
 */
export async function collectorBotWebhookHandler(
	request: Request,
): Promise<Response> {
	// Optional shared-secret check (Telegram echoes the secret we set on the
	// webhook). Only enforced when configured, so local/dev without a secret
	// still works.
	const expectedSecret = process.env["TELEGRAM_COLLECTOR_WEBHOOK_SECRET"];
	if (expectedSecret) {
		const got = request.headers.get("x-telegram-bot-api-secret-token");
		if (got !== expectedSecret) {
			return new Response("forbidden", { status: 403 });
		}
	}

	const botToken = process.env["TELEGRAM_COLLECTOR_BOT_TOKEN"];

	try {
		const body = await request.json();
		const messages = telegram.parseWebhookPayload(body);

		for (const message of messages) {
			const match = message.text.trim().match(/^\/start\s+(\S+)/);
			const linkToken = match?.[1];
			if (!linkToken) {
				continue;
			}

			const employee = await db.employee.findFirst({
				where: { telegramLinkToken: linkToken },
				select: { id: true, organizationId: true, name: true },
			});
			if (!employee) {
				logger.warn("[Collector Bot] /start with unknown link token");
				continue;
			}

			await db.employee.update({
				where: { id: employee.id },
				data: {
					telegramChatId: message.chatId,
					telegramLinkToken: null,
				},
			});

			if (botToken) {
				await telegram.sendTextMessage(
					botToken,
					message.chatId,
					`✅ ${tgBold("Connected!")}\n\nYou'll now receive your notifications here, ${tgEscape(employee.name)}.`,
					{ parseMode: "HTML" },
				);
			}
		}
	} catch (error) {
		logger.error("[Collector Bot] webhook error", {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	return new Response("OK", { status: 200 });
}
