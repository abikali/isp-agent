import { logger } from "@repo/logs";
import { createWasender } from "wasenderapi";
import type {
	ParsedMessage,
	SendMessageOptions,
	SendMessageResult,
} from "../types";
import { acquireSendSlot, trySendSlot } from "./rate-limiter";

/**
 * Create a WaSender SDK client instance.
 * We create instances per-call since our provider abstraction passes
 * apiToken as a parameter (not held in module-level state).
 */
function createClient(apiToken?: string, personalAccessToken?: string) {
	return createWasender(apiToken, personalAccessToken ?? "");
}

// ─── Webhook Payload Types (kept custom — SDK's webhook handler needs a
//     request adapter and returns a different format than our ParsedMessage) ───

interface WaSenderMessageKey {
	id: string;
	fromMe: boolean;
	remoteJid: string;
	cleanedSenderPn?: string | undefined;
	senderPn?: string | undefined;
}

interface WaSenderMediaMessage {
	url?: string | undefined;
	directPath?: string | undefined;
	mediaKey?: string | undefined;
	mimetype?: string | undefined;
	fileSha256?: string | undefined;
	fileLength?: string | number | undefined;
	caption?: string | undefined;
	fileName?: string | undefined;
}

interface WaSenderMessageContent {
	conversation?: string | undefined;
	imageMessage?: WaSenderMediaMessage | undefined;
	audioMessage?: WaSenderMediaMessage | undefined;
	videoMessage?: WaSenderMediaMessage | undefined;
	documentMessage?: WaSenderMediaMessage | undefined;
	stickerMessage?: WaSenderMediaMessage | undefined;
	contactMessage?: unknown | undefined;
	locationMessage?:
		| {
				degreesLatitude?: number | undefined;
				degreesLongitude?: number | undefined;
		  }
		| undefined;
}

interface WaSenderMessage {
	key: WaSenderMessageKey;
	messageBody?: string | undefined;
	message?: WaSenderMessageContent | undefined;
	pushName?: string | undefined;
	messageTimestamp?: number | string | undefined;
}

interface WaSenderWebhookPayload {
	event: string;
	timestamp?: number | string | undefined;
	data?: {
		messages?: WaSenderMessage | WaSenderMessage[] | undefined;
	};
}

interface ExtractedMessage {
	text: string;
	mediaId?: string | undefined;
	mediaLink?: string | undefined;
	mediaType?: string | undefined;
	mediaCaption?: string | undefined;
}

function extractMessage(msg: WaSenderMessage): ExtractedMessage | null {
	const content = msg.message;

	// Text message (conversation field)
	if (msg.messageBody || content?.conversation) {
		const text = msg.messageBody ?? content?.conversation ?? "";
		if (text) {
			return { text };
		}
	}

	// Image
	if (content?.imageMessage) {
		return {
			text: content.imageMessage.caption
				? `[Image] ${content.imageMessage.caption}`
				: "[Image received]",
			mediaId: msg.key.id,
			mediaLink: JSON.stringify({
				messages: {
					key: { id: msg.key.id },
					message: { imageMessage: content.imageMessage },
				},
			}),
			mediaType: "image",
			mediaCaption: content.imageMessage.caption ?? undefined,
		};
	}

	// Audio / Voice
	if (content?.audioMessage) {
		return {
			text: "[Voice message received]",
			mediaId: msg.key.id,
			mediaLink: JSON.stringify({
				messages: {
					key: { id: msg.key.id },
					message: { audioMessage: content.audioMessage },
				},
			}),
			mediaType: "voice",
		};
	}

	// Video
	if (content?.videoMessage) {
		return {
			text: content.videoMessage.caption
				? `[Video] ${content.videoMessage.caption}`
				: "[Video received]",
		};
	}

	// Document
	if (content?.documentMessage) {
		return {
			text: content.documentMessage.fileName
				? `[Document: ${content.documentMessage.fileName}]`
				: "[Document received]",
		};
	}

	// Sticker
	if (content?.stickerMessage) {
		return { text: "[Sticker received]" };
	}

	// Location
	if (content?.locationMessage) {
		const lat = content.locationMessage.degreesLatitude;
		const lng = content.locationMessage.degreesLongitude;
		if (lat != null && lng != null) {
			return { text: `[Location: ${lat}, ${lng}]` };
		}
		return { text: "[Location received]" };
	}

	// Contact
	if (content?.contactMessage) {
		return { text: "[Contact shared]" };
	}

	return null;
}

export function parseWebhookPayload(body: unknown): ParsedMessage[] {
	const payload = body as WaSenderWebhookPayload;

	// Only handle message events
	if (!payload.event || !payload.event.startsWith("messages.")) {
		return [];
	}

	// Normalize messages to array (messages.received = single object, messages.upsert = array)
	const rawMessages = payload.data?.messages;
	if (!rawMessages) {
		return [];
	}
	const messages: WaSenderMessage[] = Array.isArray(rawMessages)
		? rawMessages
		: [rawMessages];

	const results: ParsedMessage[] = [];
	for (const msg of messages) {
		// Skip outgoing messages
		if (msg.key.fromMe) {
			continue;
		}
		const extracted = extractMessage(msg);
		if (extracted) {
			const timestamp =
				typeof msg.messageTimestamp === "string"
					? Number.parseInt(msg.messageTimestamp, 10)
					: msg.messageTimestamp;

			results.push({
				chatId: msg.key.remoteJid,
				messageId: msg.key.id,
				text: extracted.text,
				contactName: msg.pushName ?? undefined,
				contactId: msg.key.cleanedSenderPn ?? undefined,
				timestamp: timestamp ?? undefined,
				mediaId: extracted.mediaId,
				mediaLink: extracted.mediaLink,
				mediaType: extracted.mediaType,
				mediaCaption: extracted.mediaCaption,
			});
		}
	}
	return results;
}

export async function sendTypingIndicator(
	apiToken: string,
	chatId: string,
): Promise<void> {
	try {
		const slotAvailable = await trySendSlot(apiToken);
		if (!slotAvailable) {
			return; // Skip typing indicator rather than block
		}
		const client = createClient(apiToken);
		await client.sendPresenceUpdate(chatId, "composing");
	} catch (error) {
		logger.error("WhatsApp typing indicator error", { error });
	}
}

export async function sendTextMessage(
	apiToken: string,
	chatId: string,
	text: string,
	_options?: SendMessageOptions,
): Promise<SendMessageResult> {
	await acquireSendSlot(apiToken);

	try {
		return await attemptSend(apiToken, chatId, text);
	} catch (error) {
		// Safety net: retry once on 429
		if (is429Error(error)) {
			const retryAfter = get429RetryAfter(error);
			logger.warn("WhatsApp 429 rate limit, retrying", { retryAfter });
			await new Promise((r) => setTimeout(r, retryAfter * 1000));

			try {
				return await attemptSend(apiToken, chatId, text);
			} catch (retryError) {
				logger.error("WhatsApp send error after 429 retry", {
					error: retryError,
				});
				return { success: false };
			}
		}

		logger.error("WhatsApp send error", { error });
		return { success: false };
	}
}

async function attemptSend(
	apiToken: string,
	chatId: string,
	text: string,
): Promise<SendMessageResult> {
	const client = createClient(apiToken);
	const result = await client.sendText({ to: chatId, text });
	const responseData = result.response as unknown as Record<string, unknown>;
	const data = responseData["data"] as
		| { msgId?: string | number }
		| undefined;
	const messageId = data?.msgId != null ? String(data.msgId) : undefined;
	return { success: true, messageId };
}

function is429Error(error: unknown): boolean {
	if (error instanceof Error) {
		return error.message.includes("429");
	}
	if (typeof error === "object" && error !== null) {
		const obj = error as Record<string, unknown>;
		return obj["status"] === 429 || obj["statusCode"] === 429;
	}
	return false;
}

function get429RetryAfter(error: unknown): number {
	if (typeof error === "object" && error !== null) {
		const obj = error as Record<string, unknown>;
		const retryAfter = obj["retryAfter"];
		if (typeof retryAfter === "number" && retryAfter > 0) {
			return retryAfter;
		}
	}
	return 3; // Default from WaSender docs
}

/**
 * Download a media file from WaSender.
 *
 * Strategy:
 * 1. Parse the raw media payload (full message object from webhook).
 * 2. Call /api/decrypt-media directly to get a public URL.
 * 3. Download the binary from the public URL.
 */
async function downloadMedia(
	apiToken: string,
	_mediaId: string,
	rawMediaPayload?: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	if (!rawMediaPayload) {
		logger.error("WhatsApp media download failed: no media payload");
		return null;
	}

	try {
		const messageObject = JSON.parse(rawMediaPayload) as Record<
			string,
			unknown
		>;

		// Log payload keys to verify directPath is included
		const messages = messageObject["messages"] as
			| Record<string, unknown>
			| undefined;
		const message = messages?.["message"] as
			| Record<string, unknown>
			| undefined;
		const mediaMsg = message
			? (Object.values(message)[0] as Record<string, unknown> | undefined)
			: undefined;
		logger.info("WaSender decrypt-media request payload keys", {
			hasDirectPath: mediaMsg ? "directPath" in mediaMsg : false,
			mediaKeys: mediaMsg ? Object.keys(mediaMsg) : [],
		});

		// Call decrypt-media API directly (bypass SDK to control exact payload)
		const response = await fetch(`${WASENDER_BASE_URL}/decrypt-media`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ data: messageObject }),
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error("WaSender decrypt-media failed", {
				status: response.status,
				error: errorText,
			});
			return null;
		}

		const data = (await response.json()) as Record<string, unknown>;
		logger.info("WaSender decrypt-media response", { data });
		const publicUrl = data["publicUrl"] as string | undefined;
		if (!publicUrl) {
			logger.error("WaSender decrypt-media returned no publicUrl", {
				response: data,
			});
			return null;
		}

		// Download the decrypted media file (retry with exponential backoff —
		// WaSender decryption is async, the publicUrl may not be ready immediately)
		const maxAttempts = 5;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			if (attempt > 0) {
				await new Promise((r) =>
					setTimeout(r, 2000 * 2 ** (attempt - 1)),
				);
			}
			const result = await fetchFromUrl(publicUrl);
			if (result.media) {
				return result.media;
			}
			logger.warn("WaSender media download attempt failed", {
				attempt: attempt + 1,
				maxAttempts,
				status: result.status,
				publicUrl,
			});
		}
		logger.error("WaSender media download failed after retries", {
			publicUrl,
		});
		return null;
	} catch (error) {
		logger.error("WhatsApp media download error", { error });
		return null;
	}
}

interface FetchResult {
	media: { buffer: Buffer; contentType: string } | null;
	status: string;
}

async function fetchFromUrl(url: string): Promise<FetchResult> {
	try {
		const response = await fetch(url);
		if (!response.ok) {
			return { media: null, status: `http_${response.status}` };
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		if (buffer.length === 0) {
			return {
				media: null,
				status: `empty_body(content-type=${response.headers.get("content-type")},content-length=${response.headers.get("content-length")})`,
			};
		}
		const contentType =
			response.headers.get("content-type") ?? "application/octet-stream";
		return { media: { buffer, contentType }, status: "ok" };
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "unknown_error";
		return { media: null, status: message };
	}
}

/**
 * Transcribe a voice message using OpenAI Whisper API.
 */
export async function transcribeAudio(
	apiToken: string,
	mediaId: string,
	rawMediaPayload?: string,
): Promise<string | null> {
	const apiKey = process.env["OPENAI_API_KEY"];
	if (!apiKey) {
		logger.error("OPENAI_API_KEY not set, cannot transcribe voice");
		return null;
	}

	const media = await downloadMedia(apiToken, mediaId, rawMediaPayload);
	if (!media) {
		return null;
	}

	try {
		const form = new FormData();
		// Strip codec params like "; codecs=opus" from content-type
		const mimeType = media.contentType.split(";")[0]?.trim() ?? "audio/ogg";

		// Map MIME type to Whisper-supported extension
		const extMap: Record<string, string> = {
			"audio/ogg": "ogg",
			"audio/mpeg": "mp3",
			"audio/mp3": "mp3",
			"audio/mp4": "m4a",
			"audio/x-m4a": "m4a",
			"audio/m4a": "m4a",
			"audio/wav": "wav",
			"audio/x-wav": "wav",
			"audio/webm": "webm",
			"audio/flac": "flac",
			"audio/x-flac": "flac",
		};

		const ext = extMap[mimeType] ?? "ogg";
		const fileMime = extMap[mimeType] ? mimeType : "audio/ogg";
		// Use File instead of Blob — Node's FormData needs a proper File with name
		const file = new File([new Uint8Array(media.buffer)], `voice.${ext}`, {
			type: fileMime,
		});
		form.append("file", file);
		form.append("model", "whisper-1");

		const response = await fetch(
			"https://api.openai.com/v1/audio/transcriptions",
			{
				method: "POST",
				headers: { Authorization: `Bearer ${apiKey}` },
				body: form,
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			logger.error("Whisper transcription failed", {
				status: response.status,
				error: errorText,
				contentType: media.contentType,
				bufferSize: media.buffer.length,
				fileExt: ext,
				mediaId,
			});
			return null;
		}

		const data = (await response.json()) as { text?: string };
		return data.text ?? null;
	} catch (error) {
		logger.error("Whisper transcription error", { error });
		return null;
	}
}

/**
 * Describe an image using OpenAI GPT-4o-mini vision.
 */
export async function describeImage(
	apiToken: string,
	mediaId: string,
	caption?: string,
	rawMediaPayload?: string,
): Promise<string | null> {
	const apiKey = process.env["OPENAI_API_KEY"];
	if (!apiKey) {
		logger.error("OPENAI_API_KEY not set, cannot describe image");
		return null;
	}

	const media = await downloadMedia(apiToken, mediaId, rawMediaPayload);
	if (!media) {
		return null;
	}

	try {
		const base64 = media.buffer.toString("base64");
		const dataUrl = `data:${media.contentType};base64,${base64}`;

		const userContent: Array<Record<string, unknown>> = [
			{
				type: "image_url",
				image_url: { url: dataUrl },
			},
			{
				type: "text",
				text: caption
					? `The user sent this image with caption: "${caption}". Describe what you see concisely so a text-only assistant can understand and respond.`
					: "The user sent this image. Describe what you see concisely so a text-only assistant can understand and respond.",
			},
		];

		const response = await fetch(
			"https://api.openai.com/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${apiKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "gpt-4o-mini",
					messages: [{ role: "user", content: userContent }],
					max_tokens: 300,
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			logger.error("Image description failed", {
				status: response.status,
				error: errorText,
			});
			return null;
		}

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		return data.choices?.[0]?.message?.content ?? null;
	} catch (error) {
		logger.error("Image description error", { error });
		return null;
	}
}

const WASENDER_BASE_URL = "https://www.wasenderapi.com/api";

/**
 * Mark a message as read. Kept as raw fetch — the SDK has no method for this.
 */
export async function markAsRead(
	apiToken: string,
	messageId: string,
	chatId?: string,
): Promise<void> {
	if (!chatId) {
		return;
	}
	try {
		await fetch(`${WASENDER_BASE_URL}/messages/read`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				key: { id: messageId, remoteJid: chatId, fromMe: false },
			}),
		});
	} catch (error) {
		logger.error("WhatsApp markAsRead error", { error });
	}
}

export async function setWebhook(
	personalAccessToken: string,
	sessionId: string,
	webhookUrl: string,
): Promise<boolean> {
	try {
		const client = createClient(undefined, personalAccessToken);
		await client.updateWhatsAppSession(Number.parseInt(sessionId, 10), {
			webhook_url: webhookUrl,
			webhook_enabled: true,
			webhook_events: ["messages.received"],
		});
		return true;
	} catch (error) {
		logger.error("WhatsApp setWebhook error", { error });
		return false;
	}
}

export async function deleteWebhook(
	personalAccessToken: string,
	sessionId: string,
): Promise<boolean> {
	try {
		const client = createClient(undefined, personalAccessToken);
		await client.updateWhatsAppSession(Number.parseInt(sessionId, 10), {
			webhook_url: null,
			webhook_enabled: false,
		});
		return true;
	} catch (error) {
		logger.error("WhatsApp deleteWebhook error", { error });
		return false;
	}
}
