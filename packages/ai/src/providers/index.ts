import type {
	ChannelProvider,
	ParsedMessage,
	SendMessageResult,
} from "../types";
import * as telegram from "./telegram";
import * as whatsapp from "./whatsapp";

export function parseWebhookPayload(
	provider: ChannelProvider,
	body: unknown,
): ParsedMessage[] {
	switch (provider) {
		case "whatsapp":
			return whatsapp.parseWebhookPayload(body);
		case "telegram":
			return telegram.parseWebhookPayload(body);
		default:
			return [];
	}
}

export async function sendTextMessage(
	provider: ChannelProvider,
	apiToken: string,
	chatId: string,
	text: string,
): Promise<SendMessageResult> {
	switch (provider) {
		case "whatsapp":
			return whatsapp.sendTextMessage(apiToken, chatId, text);
		case "telegram":
			return telegram.sendTextMessage(apiToken, chatId, text);
		default:
			return { success: false };
	}
}

export async function sendTypingIndicator(
	provider: ChannelProvider,
	apiToken: string,
	chatId: string,
): Promise<void> {
	switch (provider) {
		case "whatsapp":
			return whatsapp.sendTypingIndicator(apiToken, chatId);
		case "telegram":
			return telegram.sendTypingIndicator(apiToken, chatId);
	}
}

export { telegram, whatsapp };
