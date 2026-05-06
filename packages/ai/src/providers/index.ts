import type {
	ChannelProvider,
	ParsedMessage,
	SendMediaOptions,
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
	if (!text.trim()) {
		return { success: true };
	}
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
	chatId?: string,
): Promise<void> {
	switch (provider) {
		case "whatsapp":
			return whatsapp.markAsRead(apiToken, messageId, chatId);
		case "telegram":
			// Telegram auto-reads in bot API, no-op
			return;
	}
}

/**
 * Process media attachments (voice, image, document) into text.
 * Uses the serialized media payload for provider-specific download/decryption.
 * Returns the transcribed/described text, or null if processing fails.
 */
export async function processMedia(
	apiToken: string,
	mediaType: string,
	mediaId: string,
	mediaCaption?: string,
	mediaLink?: string,
	fileName?: string,
	userLanguageHint?: string,
): Promise<string | null> {
	switch (mediaType) {
		case "voice":
			return whatsapp.transcribeAudio(apiToken, mediaId, mediaLink);
		case "image":
			return whatsapp.describeImage(
				apiToken,
				mediaId,
				mediaCaption,
				mediaLink,
				userLanguageHint,
			);
		case "document":
			return whatsapp.describeDocument(
				apiToken,
				mediaId,
				fileName,
				mediaLink,
				userLanguageHint,
			);
		default:
			return null;
	}
}

/**
 * Process media attachments and return them already wrapped in the same
 * placeholder shape (e.g. `[Image: ...]`) used in stored conversation
 * content. Returns null when there's no media or when processing failed —
 * in either case the caller should fall back to its existing text.
 */
export async function transcribeMessageMedia(
	apiToken: string,
	msg: {
		mediaId?: string | undefined;
		mediaType?: string | undefined;
		mediaCaption?: string | undefined;
		mediaLink?: string | undefined;
		mediaFileName?: string | undefined;
	},
	userLanguageHint?: string,
): Promise<string | null> {
	if (!msg.mediaId || !msg.mediaType) {
		return null;
	}
	const processed = await processMedia(
		apiToken,
		msg.mediaType,
		msg.mediaId,
		msg.mediaCaption,
		msg.mediaLink,
		msg.mediaFileName,
		userLanguageHint,
	);
	if (!processed) {
		return null;
	}
	switch (msg.mediaType) {
		case "voice":
			return processed;
		case "image":
			return msg.mediaCaption
				? `[Image: ${processed}] ${msg.mediaCaption}`
				: `[Image: ${processed}]`;
		case "document":
			return `[Document: ${msg.mediaFileName ?? "file"}]\n${processed}`;
		default:
			return null;
	}
}

/**
 * Send a media message (image, video, audio, document, sticker, location) to an external channel.
 */
export async function sendMediaMessage(
	provider: ChannelProvider,
	apiToken: string,
	chatId: string,
	options: SendMediaOptions,
): Promise<SendMessageResult> {
	switch (provider) {
		case "whatsapp":
			return whatsapp.sendMediaMessage(apiToken, chatId, options);
		case "telegram":
			return telegram.sendMediaMessage(apiToken, chatId, options);
		default:
			return { success: false };
	}
}

export { telegram, whatsapp };
