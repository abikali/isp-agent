import type {
	ChannelProvider,
	ParsedMessage,
	SendMessageOptions,
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
	options?: SendMessageOptions,
): Promise<SendMessageResult> {
	switch (provider) {
		case "whatsapp":
			return whatsapp.sendTextMessage(apiToken, chatId, text, options);
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

export async function markAsRead(
	provider: ChannelProvider,
	apiToken: string,
	messageId: string,
): Promise<void> {
	switch (provider) {
		case "whatsapp":
			return whatsapp.markAsRead(apiToken, messageId);
		case "telegram":
			// Telegram auto-reads in bot API, no-op
			return;
	}
}

/**
 * Process media attachments (voice, image) into text.
 * Prefers the direct media link (S3 URL) when available, otherwise
 * falls back to downloading via GET /media/{id} with auth.
 * Returns the transcribed/described text, or null if processing fails.
 */
export async function processMedia(
	whapiToken: string,
	mediaType: string,
	mediaId: string,
	mediaCaption?: string,
	mediaLink?: string,
	messageId?: string,
): Promise<string | null> {
	switch (mediaType) {
		case "voice":
			return whatsapp.transcribeAudio(
				whapiToken,
				mediaId,
				mediaLink,
				messageId,
			);
		case "image":
			return whatsapp.describeImage(
				whapiToken,
				mediaId,
				mediaCaption,
				mediaLink,
				messageId,
			);
		default:
			return null;
	}
}

export { telegram, whatsapp };
