import { logger } from "@repo/logs";
import { Api } from "grammy";
import type { Update } from "grammy/types";
import type { ParsedMessage, SendMessageResult } from "../types";

export function parseWebhookPayload(body: unknown): ParsedMessage[] {
	const update = body as Update;
	if (!update.message?.text) {
		return [];
	}

	const msg = update.message;
	const text = msg.text ?? "";
	const contactName = [msg.from?.first_name, msg.from?.last_name]
		.filter(Boolean)
		.join(" ");

	return [
		{
			chatId: String(msg.chat.id),
			messageId: String(msg.message_id),
			text,
			contactName: contactName || undefined,
			contactId: msg.from?.id ? String(msg.from.id) : undefined,
			timestamp: msg.date,
		},
	];
}

export function isStartCommand(body: unknown): boolean {
	const update = body as Update;
	return update.message?.text === "/start";
}

export async function sendTypingIndicator(
	apiToken: string,
	chatId: string,
): Promise<void> {
	try {
		const api = new Api(apiToken);
		await api.sendChatAction(Number(chatId), "typing");
	} catch (error) {
		logger.error("Telegram typing indicator error", { error });
	}
}

export async function sendTextMessage(
	apiToken: string,
	chatId: string,
	text: string,
): Promise<SendMessageResult> {
	try {
		const api = new Api(apiToken);
		const result = await api.sendMessage(Number(chatId), text, {
			parse_mode: "Markdown",
		});
		return { success: true, messageId: String(result.message_id) };
	} catch (error) {
		logger.error("Telegram send error", { error });
		return { success: false };
	}
}

export async function setWebhook(
	apiToken: string,
	webhookUrl: string,
	secretToken: string,
): Promise<boolean> {
	try {
		const api = new Api(apiToken);
		await api.setWebhook(webhookUrl, { secret_token: secretToken });
		return true;
	} catch (error) {
		logger.error("Telegram setWebhook error", { error });
		return false;
	}
}

export async function deleteWebhook(apiToken: string): Promise<boolean> {
	try {
		const api = new Api(apiToken);
		await api.deleteWebhook();
		return true;
	} catch (error) {
		logger.error("Telegram deleteWebhook error", { error });
		return false;
	}
}
