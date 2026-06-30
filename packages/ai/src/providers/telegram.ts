import { logger } from "@repo/logs";
import { Api } from "grammy";
import type { Update } from "grammy/types";
import type {
	ParsedMessage,
	SendMediaOptions,
	SendMessageResult,
} from "../types";

export function parseWebhookPayload(body: unknown): ParsedMessage[] {
	const update = body as Update;
	const msg = update.message;
	if (!msg) {
		return [];
	}

	const contactName = [msg.from?.first_name, msg.from?.last_name]
		.filter(Boolean)
		.join(" ");

	const base: ParsedMessage = {
		chatId: String(msg.chat.id),
		messageId: String(msg.message_id),
		text: "",
		contactName: contactName || undefined,
		contactId: msg.from?.id ? String(msg.from.id) : undefined,
		timestamp: msg.date,
	};

	// Text message
	if (msg.text) {
		return [{ ...base, text: msg.text }];
	}

	// Photo — take highest resolution (last in array)
	if (msg.photo && msg.photo.length > 0) {
		const photo = msg.photo[msg.photo.length - 1];
		if (photo) {
			return [
				{
					...base,
					text: msg.caption
						? `[Image] ${msg.caption}`
						: "[Image received]",
					mediaId: photo.file_id,
					mediaType: "image",
					mediaCaption: msg.caption ?? undefined,
				},
			];
		}
	}

	// Document
	if (msg.document) {
		return [
			{
				...base,
				text: msg.caption
					? `[Document: ${msg.document.file_name ?? "file"}] ${msg.caption}`
					: `[Document: ${msg.document.file_name ?? "file"}]`,
				mediaId: msg.document.file_id,
				mediaType: "document",
				mediaCaption: msg.caption ?? undefined,
				mediaFileName: msg.document.file_name ?? undefined,
			},
		];
	}

	// Voice
	if (msg.voice) {
		return [
			{
				...base,
				text: "[Voice message received]",
				mediaId: msg.voice.file_id,
				mediaType: "voice",
			},
		];
	}

	// Audio
	if (msg.audio) {
		return [
			{
				...base,
				text: msg.caption
					? `[Audio] ${msg.caption}`
					: "[Audio received]",
				mediaId: msg.audio.file_id,
				mediaType: "audio",
				mediaCaption: msg.caption ?? undefined,
			},
		];
	}

	// Video
	if (msg.video) {
		return [
			{
				...base,
				text: msg.caption
					? `[Video] ${msg.caption}`
					: "[Video received]",
				mediaId: msg.video.file_id,
				mediaType: "video",
				mediaCaption: msg.caption ?? undefined,
			},
		];
	}

	// Video note (round video)
	if (msg.video_note) {
		return [
			{
				...base,
				text: "[Video note received]",
				mediaId: msg.video_note.file_id,
				mediaType: "video",
			},
		];
	}

	// Sticker
	if (msg.sticker) {
		return [
			{
				...base,
				text: msg.sticker.emoji
					? `[Sticker: ${msg.sticker.emoji}]`
					: "[Sticker received]",
				mediaId: msg.sticker.file_id,
				mediaType: "sticker",
			},
		];
	}

	// Location
	if (msg.location) {
		return [
			{
				...base,
				text: `[Location: ${msg.location.latitude}, ${msg.location.longitude}]`,
				mediaType: "location",
				latitude: msg.location.latitude,
				longitude: msg.location.longitude,
			},
		];
	}

	// Fallback — if there's a caption but no recognized media type
	if (msg.caption) {
		return [{ ...base, text: msg.caption }];
	}

	return [];
}

export function isStartCommand(body: unknown): boolean {
	const update = body as Update;
	return update.message?.text === "/start";
}

/**
 * Download a media file from Telegram using getFile API.
 * Note: 20MB download limit via Bot API.
 */
export async function downloadMedia(
	apiToken: string,
	fileId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const api = new Api(apiToken);
		const file = await api.getFile(fileId);
		if (!file.file_path) {
			logger.error("Telegram getFile returned no file_path", { fileId });
			return null;
		}
		const url = `https://api.telegram.org/file/bot${apiToken}/${file.file_path}`;
		const response = await fetch(url);
		if (!response.ok) {
			logger.error("Telegram media download failed", {
				status: response.status,
				fileId,
			});
			return null;
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		const contentType =
			response.headers.get("content-type") ?? "application/octet-stream";
		return { buffer, contentType };
	} catch (error) {
		logger.error("Telegram media download error", { error, fileId });
		return null;
	}
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

/**
 * Send a media message (image, video, audio, document, sticker, location) via Telegram Bot API.
 */
export async function sendMediaMessage(
	apiToken: string,
	chatId: string,
	options: SendMediaOptions,
): Promise<SendMessageResult> {
	try {
		const api = new Api(apiToken);
		const numericChatId = Number(chatId);
		let messageId: string | undefined;

		const captionOpts = options.caption ? { caption: options.caption } : {};

		switch (options.mediaType) {
			case "image": {
				const res = await api.sendPhoto(
					numericChatId,
					options.mediaUrl ?? "",
					{
						...captionOpts,
					},
				);
				messageId = String(res.message_id);
				break;
			}
			case "video": {
				const res = await api.sendVideo(
					numericChatId,
					options.mediaUrl ?? "",
					{
						...captionOpts,
					},
				);
				messageId = String(res.message_id);
				break;
			}
			case "document": {
				const res = await api.sendDocument(
					numericChatId,
					options.mediaUrl ?? "",
					{
						...captionOpts,
					},
				);
				messageId = String(res.message_id);
				break;
			}
			case "audio": {
				// Use sendVoice for voice recordings (OGG/OPUS format, waveform display)
				const res = await api.sendVoice(
					numericChatId,
					options.mediaUrl ?? "",
					{
						...captionOpts,
					},
				);
				messageId = String(res.message_id);
				break;
			}
			case "sticker": {
				const res = await api.sendSticker(
					numericChatId,
					options.mediaUrl ?? "",
				);
				messageId = String(res.message_id);
				break;
			}
			case "location": {
				const res = await api.sendLocation(
					numericChatId,
					options.latitude ?? 0,
					options.longitude ?? 0,
				);
				messageId = String(res.message_id);
				break;
			}
			default:
				return { success: false };
		}

		return { success: true, messageId };
	} catch (error) {
		logger.error("Telegram media send error", {
			error,
			mediaType: options.mediaType,
		});
		return { success: false };
	}
}

/**
 * Call the Telegram Bot HTTP API directly with `fetch`. We deliberately avoid
 * grammy's `Api` here: grammy's HTTP layer does NOT survive the Nitro web
 * server bundle (its calls silently fail there), while plain `fetch` works in
 * both the bundled web server and the tsx worker. Returns the parsed JSON.
 */
async function tgApiCall(
	apiToken: string,
	method: string,
	body: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; description?: string }> {
	const res = await fetch(
		`https://api.telegram.org/bot${apiToken}/${method}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(15_000),
		},
	);
	return (await res.json()) as {
		ok: boolean;
		result?: unknown;
		description?: string;
	};
}

export interface SendTextMessageOptions {
	/**
	 * Telegram formatting mode. Defaults to "Markdown" to preserve the AI-chat
	 * reply behavior; notification call sites pass "HTML" for rich, escaped
	 * messages (bold headers, tap-to-copy `<code>` values).
	 */
	parseMode?: "Markdown" | "HTML";
	/** Suppress link previews (e.g. for maps links). */
	disableWebPagePreview?: boolean;
}

export async function sendTextMessage(
	apiToken: string,
	chatId: string,
	text: string,
	options?: SendTextMessageOptions,
): Promise<SendMessageResult> {
	const parseMode = options?.parseMode ?? "Markdown";
	const previewOpt = options?.disableWebPagePreview
		? { disable_web_page_preview: true }
		: {};
	try {
		const result = await tgApiCall(apiToken, "sendMessage", {
			chat_id: chatId,
			text,
			parse_mode: parseMode,
			...previewOpt,
		});
		if (result.ok) {
			const msg = result.result as { message_id?: number } | undefined;
			return { success: true, messageId: String(msg?.message_id ?? "") };
		}
		// Unbalanced Markdown (*/_/[) or malformed HTML entities make Telegram
		// reject the whole message ("can't parse entities"). The message must
		// still reach the recipient — resend as plain text.
		const plain = await tgApiCall(apiToken, "sendMessage", {
			chat_id: chatId,
			text,
			...previewOpt,
		});
		if (plain.ok) {
			const msg = plain.result as { message_id?: number } | undefined;
			logger.warn(
				`Telegram ${parseMode} parse failed, sent as plain text`,
				{ error: result.description },
			);
			return { success: true, messageId: String(msg?.message_id ?? "") };
		}
		logger.error("Telegram send error", { error: plain.description });
		return { success: false };
	} catch (error) {
		logger.error("Telegram send error", { error: String(error) });
		return { success: false };
	}
}

/**
 * Resolve the bot's @username via getMe — needed to build a
 * `https://t.me/<username>?start=<token>` deep link. Returns null on failure
 * so callers can degrade gracefully.
 */
export async function getBotUsername(apiToken: string): Promise<string | null> {
	try {
		const me = await tgApiCall(apiToken, "getMe", {});
		if (!me.ok) {
			return null;
		}
		return (me.result as { username?: string }).username ?? null;
	} catch (error) {
		logger.error("Telegram getMe error", { error: String(error) });
		return null;
	}
}

export async function setWebhook(
	apiToken: string,
	webhookUrl: string,
	secretToken: string,
): Promise<boolean> {
	try {
		// Telegram rejects an empty secret_token; only send it when configured.
		const result = await tgApiCall(apiToken, "setWebhook", {
			url: webhookUrl,
			...(secretToken ? { secret_token: secretToken } : {}),
		});
		return result.ok;
	} catch (error) {
		logger.error("Telegram setWebhook error", { error: String(error) });
		return false;
	}
}

export async function deleteWebhook(apiToken: string): Promise<boolean> {
	try {
		const result = await tgApiCall(apiToken, "deleteWebhook", {});
		return result.ok;
	} catch (error) {
		logger.error("Telegram deleteWebhook error", { error: String(error) });
		return false;
	}
}
