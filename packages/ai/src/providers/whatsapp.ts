import { logger } from "@repo/logs";
import type {
	ParsedMessage,
	SendMessageOptions,
	SendMessageResult,
} from "../types";

const WHAPI_BASE_URL = "https://gate.whapi.cloud";

interface WhapiMediaContent {
	id?: string | undefined;
	caption?: string | undefined;
	link?: string | undefined;
}

interface WhapiVoice {
	id?: string | undefined;
	link?: string | undefined;
	seconds?: number | undefined;
}

interface WhapiDocument extends WhapiMediaContent {
	filename?: string | undefined;
}

interface WhapiLocation {
	latitude?: number | undefined;
	longitude?: number | undefined;
}

interface WhapiMessage {
	id: string;
	type: string;
	text?: { body: string };
	image?: WhapiMediaContent | undefined;
	video?: WhapiMediaContent | undefined;
	audio?: WhapiMediaContent | undefined;
	voice?: WhapiVoice | undefined;
	document?: WhapiDocument | undefined;
	sticker?: unknown | undefined;
	location?: WhapiLocation | undefined;
	contact_message?: unknown | undefined;
	from: string;
	from_me: boolean;
	from_name?: string;
	source?: string | undefined;
	chat_id: string;
	timestamp: number;
}

interface WhapiEvent {
	type: string;
	event: string;
}

interface WhapiWebhookPayload {
	messages?: WhapiMessage[];
	event?: WhapiEvent | undefined;
	channel_id?: string | undefined;
}

interface WhapiSendResponse {
	sent?: boolean | undefined;
	message?: { id?: string | undefined } | undefined;
}

interface ExtractedMessage {
	text: string;
	mediaId?: string | undefined;
	mediaType?: string | undefined;
	mediaCaption?: string | undefined;
}

function extractMessage(msg: WhapiMessage): ExtractedMessage | null {
	switch (msg.type) {
		case "text":
			return msg.text?.body ? { text: msg.text.body } : null;
		case "image":
			return {
				text: msg.image?.caption
					? `[Image] ${msg.image.caption}`
					: "[Image received]",
				mediaId: msg.image?.id ?? undefined,
				mediaType: "image",
				mediaCaption: msg.image?.caption ?? undefined,
			};
		case "video":
			return {
				text: msg.video?.caption
					? `[Video] ${msg.video.caption}`
					: "[Video received]",
			};
		case "audio":
		case "voice": {
			const voiceId = msg.voice?.id ?? msg.audio?.id;
			return {
				text: "[Voice message received]",
				mediaId: voiceId ?? undefined,
				mediaType: "voice",
			};
		}
		case "document":
			return {
				text: msg.document?.filename
					? `[Document: ${msg.document.filename}]`
					: "[Document received]",
			};
		case "sticker":
			return { text: "[Sticker received]" };
		case "location":
			if (
				msg.location?.latitude != null &&
				msg.location.longitude != null
			) {
				return {
					text: `[Location: ${msg.location.latitude}, ${msg.location.longitude}]`,
				};
			}
			return { text: "[Location received]" };
		case "contact":
			return { text: "[Contact shared]" };
		default:
			return null;
	}
}

export function parseWebhookPayload(body: unknown): ParsedMessage[] {
	const payload = body as WhapiWebhookPayload;
	if (!payload.messages || !Array.isArray(payload.messages)) {
		return [];
	}

	const results: ParsedMessage[] = [];
	for (const msg of payload.messages) {
		if (msg.from_me) {
			continue;
		}
		const extracted = extractMessage(msg);
		if (extracted) {
			results.push({
				chatId: msg.chat_id,
				messageId: msg.id,
				text: extracted.text,
				contactName: msg.from_name ?? undefined,
				contactId: msg.from,
				timestamp: msg.timestamp,
				mediaId: extracted.mediaId,
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
		await fetch(`${WHAPI_BASE_URL}/presences/${chatId}`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ status: "typing" }),
		});
	} catch (error) {
		logger.error("WhatsApp typing indicator error", { error });
	}
}

export async function sendTextMessage(
	apiToken: string,
	chatId: string,
	text: string,
	options?: SendMessageOptions,
): Promise<SendMessageResult> {
	try {
		const body: Record<string, unknown> = {
			to: chatId,
			body: text,
		};
		if (options?.quoted) {
			body["quoted"] = options.quoted;
		}
		if (options?.typingTime != null) {
			body["typing_time"] = options.typingTime;
		}

		const response = await fetch(`${WHAPI_BASE_URL}/messages/text`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			const errorText = await response.text();
			logger.error("WhatsApp send failed", {
				status: response.status,
				error: errorText,
			});
			return { success: false };
		}

		const data = (await response.json()) as WhapiSendResponse;
		const messageId = data.message?.id ?? undefined;
		return { success: data.sent !== false, messageId };
	} catch (error) {
		logger.error("WhatsApp send error", { error });
		return { success: false };
	}
}

/**
 * Download a media file from Whapi using GET /media/{mediaId} with auth.
 */
async function downloadMedia(
	apiToken: string,
	mediaId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const response = await fetch(`${WHAPI_BASE_URL}/media/${mediaId}`, {
			headers: {
				Authorization: `Bearer ${apiToken}`,
			},
		});
		if (!response.ok) {
			const errorText = await response.text();
			logger.error("WhatsApp media download failed", {
				status: response.status,
				mediaId,
				error: errorText,
			});
			return null;
		}
		const buffer = Buffer.from(await response.arrayBuffer());
		const contentType =
			response.headers.get("content-type") ?? "application/octet-stream";
		return { buffer, contentType };
	} catch (error) {
		logger.error("WhatsApp media download error", { error, mediaId });
		return null;
	}
}

/**
 * Transcribe a voice message using OpenAI Whisper API.
 */
export async function transcribeAudio(
	whapiToken: string,
	mediaId: string,
): Promise<string | null> {
	const apiKey = process.env["OPENAI_API_KEY"];
	if (!apiKey) {
		logger.error("OPENAI_API_KEY not set, cannot transcribe voice");
		return null;
	}

	const media = await downloadMedia(whapiToken, mediaId);
	if (!media) {
		return null;
	}

	try {
		const form = new FormData();
		// Use audio/ogg as the MIME type (strip codec params like "; codecs=opus")
		const mimeType = media.contentType.split(";")[0]?.trim() ?? "audio/ogg";
		// Map MIME type to Whisper-supported extension
		const extMap: Record<string, string> = {
			"audio/ogg": "ogg",
			"audio/mpeg": "mp3",
			"audio/mp4": "m4a",
			"audio/wav": "wav",
			"audio/webm": "webm",
			"audio/flac": "flac",
		};
		const ext = extMap[mimeType] ?? "ogg";
		// Use File instead of Blob — Node's FormData needs a proper File with name
		const file = new File([new Uint8Array(media.buffer)], `voice.${ext}`, {
			type: mimeType,
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
	whapiToken: string,
	mediaId: string,
	caption?: string,
): Promise<string | null> {
	const apiKey = process.env["OPENAI_API_KEY"];
	if (!apiKey) {
		logger.error("OPENAI_API_KEY not set, cannot describe image");
		return null;
	}

	const media = await downloadMedia(whapiToken, mediaId);
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

export async function markAsRead(
	apiToken: string,
	messageId: string,
): Promise<void> {
	try {
		await fetch(`${WHAPI_BASE_URL}/messages/${messageId}`, {
			method: "PUT",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ status: "read" }),
		});
	} catch (error) {
		logger.error("WhatsApp markAsRead error", { error });
	}
}

export async function setWebhook(
	apiToken: string,
	webhookUrl: string,
): Promise<boolean> {
	try {
		const response = await fetch(`${WHAPI_BASE_URL}/settings`, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				webhooks: [
					{
						mode: "body",
						url: webhookUrl,
						events: [{ type: "messages", method: "post" }],
					},
				],
			}),
		});
		if (!response.ok) {
			const errorText = await response.text();
			logger.error("WhatsApp setWebhook failed", {
				status: response.status,
				error: errorText,
			});
			return false;
		}
		return true;
	} catch (error) {
		logger.error("WhatsApp setWebhook error", { error });
		return false;
	}
}

export async function deleteWebhook(apiToken: string): Promise<boolean> {
	try {
		const response = await fetch(`${WHAPI_BASE_URL}/settings`, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${apiToken}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ webhooks: [] }),
		});
		if (!response.ok) {
			const errorText = await response.text();
			logger.error("WhatsApp deleteWebhook failed", {
				status: response.status,
				error: errorText,
			});
			return false;
		}
		return true;
	} catch (error) {
		logger.error("WhatsApp deleteWebhook error", { error });
		return false;
	}
}
