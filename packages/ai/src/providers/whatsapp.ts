import { logger } from "@repo/logs";
import { generateText } from "ai";
import { createWasender } from "wasenderapi";
import { getModel } from "../model-registry";
import type {
	ParsedMessage,
	SendMediaOptions,
	SendMessageOptions,
	SendMessageResult,
} from "../types";
import { acquireSendSlot, tryTypingSlot } from "./rate-limiter";

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
	mediaFileName?: string | undefined;
	latitude?: number | undefined;
	longitude?: number | undefined;
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
			mediaId: msg.key.id,
			mediaLink: JSON.stringify({
				messages: {
					key: { id: msg.key.id },
					message: { videoMessage: content.videoMessage },
				},
			}),
			mediaType: "video",
			mediaCaption: content.videoMessage.caption ?? undefined,
		};
	}

	// Document
	if (content?.documentMessage) {
		return {
			text: content.documentMessage.fileName
				? `[Document: ${content.documentMessage.fileName}]`
				: "[Document received]",
			mediaId: msg.key.id,
			mediaLink: JSON.stringify({
				messages: {
					key: { id: msg.key.id },
					message: { documentMessage: content.documentMessage },
				},
			}),
			mediaType: "document",
			mediaCaption: content.documentMessage.caption ?? undefined,
			mediaFileName: content.documentMessage.fileName ?? undefined,
		};
	}

	// Sticker
	if (content?.stickerMessage) {
		return {
			text: "[Sticker received]",
			mediaId: msg.key.id,
			mediaLink: JSON.stringify({
				messages: {
					key: { id: msg.key.id },
					message: { stickerMessage: content.stickerMessage },
				},
			}),
			mediaType: "sticker",
		};
	}

	// Location
	if (content?.locationMessage) {
		const lat = content.locationMessage.degreesLatitude;
		const lng = content.locationMessage.degreesLongitude;
		if (lat != null && lng != null) {
			return {
				text: `[Location: ${lat}, ${lng}]`,
				mediaType: "location",
				latitude: lat,
				longitude: lng,
			};
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

	// Normalize messages to array (messages.upsert = array, messages.received (legacy) = single object)
	const rawMessages = payload.data?.messages;
	if (!rawMessages) {
		return [];
	}
	const messages: WaSenderMessage[] = Array.isArray(rawMessages)
		? rawMessages
		: [rawMessages];

	const results: ParsedMessage[] = [];
	for (const msg of messages) {
		// Include outgoing messages with fromMe flag — handler decides what to do
		if (msg.key.fromMe) {
			const extracted = extractMessage(msg);
			results.push({
				chatId: msg.key.remoteJid,
				messageId: msg.key.id,
				text: extracted?.text ?? "",
				fromMe: true,
			});
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
				mediaFileName: extracted.mediaFileName,
				latitude: extracted.latitude,
				longitude: extracted.longitude,
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
		const slotAvailable = await tryTypingSlot(apiToken, chatId);
		if (!slotAvailable) {
			return; // Skip if we sent one recently for this chat
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
 * Send a media message (image, video, audio, document, sticker, location) via WaSender.
 */
export async function sendMediaMessage(
	apiToken: string,
	chatId: string,
	options: SendMediaOptions,
): Promise<SendMessageResult> {
	await acquireSendSlot(apiToken);

	try {
		const client = createClient(apiToken);
		let result: { response: unknown };
		const textOpts = options.caption ? { text: options.caption } : {};

		switch (options.mediaType) {
			case "image":
				result = await client.sendImage({
					to: chatId,
					imageUrl: options.mediaUrl ?? "",
					...textOpts,
				});
				break;
			case "video":
				result = await client.sendVideo({
					to: chatId,
					videoUrl: options.mediaUrl ?? "",
					...textOpts,
				});
				break;
			case "document":
				result = await client.sendDocument({
					to: chatId,
					documentUrl: options.mediaUrl ?? "",
					...textOpts,
				});
				break;
			case "audio":
				result = await client.sendAudio({
					to: chatId,
					audioUrl: options.mediaUrl ?? "",
				});
				break;
			case "sticker":
				result = await client.sendSticker({
					to: chatId,
					stickerUrl: options.mediaUrl ?? "",
				});
				break;
			case "location":
				result = await client.sendLocation({
					to: chatId,
					location: {
						latitude: options.latitude ?? 0,
						longitude: options.longitude ?? 0,
					},
				});
				break;
			default:
				return { success: false };
		}

		const responseData = result.response as unknown as Record<
			string,
			unknown
		>;
		const data = responseData["data"] as
			| { msgId?: string | number }
			| undefined;
		const messageId = data?.msgId != null ? String(data.msgId) : undefined;
		return { success: true, messageId };
	} catch (error) {
		// Safety net: retry once on 429
		if (is429Error(error)) {
			const retryAfter = get429RetryAfter(error);
			logger.warn("WhatsApp media 429 rate limit, retrying", {
				retryAfter,
			});
			await new Promise((r) => setTimeout(r, retryAfter * 1000));

			try {
				return await sendMediaMessage(apiToken, chatId, options);
			} catch (retryError) {
				logger.error("WhatsApp media send error after 429 retry", {
					error: retryError,
				});
				return { success: false };
			}
		}

		logger.error("WhatsApp media send error", {
			error,
			mediaType: options.mediaType,
		});
		return { success: false };
	}
}

/**
 * Download a media file from WaSender.
 *
 * Strategy:
 * 1. Parse the raw media payload (full message object from webhook).
 * 2. Call /api/decrypt-media directly to get a public URL.
 * 3. Download the binary from the public URL.
 */
export async function downloadMedia(
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
		const maxAttempts = 7;
		for (let attempt = 0; attempt < maxAttempts; attempt++) {
			// Start with 3s delay, then 3s, 6s, 12s, 24s, 48s (total ~96s)
			if (attempt > 0) {
				await new Promise((r) =>
					setTimeout(r, 3000 * 2 ** (attempt - 1)),
				);
			} else {
				// Even the first attempt needs a short delay — WaSender needs time to decrypt
				await new Promise((r) => setTimeout(r, 3000));
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
 * Transcribe a voice message via OpenRouter's chat completions API directly.
 * We bypass the AI SDK here because `@ai-sdk/openai-compatible` only supports
 * wav/mp3 audio — OpenRouter's raw API supports OGG natively via `input_audio`.
 */
export async function transcribeAudio(
	apiToken: string,
	mediaId: string,
	rawMediaPayload?: string,
): Promise<string | null> {
	const media = await downloadMedia(apiToken, mediaId, rawMediaPayload);
	if (!media) {
		return null;
	}

	const openrouterKey = process.env["OPENROUTER_API_KEY"];
	if (!openrouterKey) {
		logger.error("OPENROUTER_API_KEY not set, cannot transcribe audio");
		return null;
	}

	try {
		const base64Audio = media.buffer.toString("base64");

		// Use Gemini Flash Lite via OpenRouter — supports OGG natively, very cheap
		const response = await fetch(
			"https://openrouter.ai/api/v1/chat/completions",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${openrouterKey}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					model: "google/gemini-2.0-flash-lite-001",
					messages: [
						{
							role: "user",
							content: [
								{
									type: "input_audio",
									input_audio: {
										data: base64Audio,
										format: "ogg",
									},
								},
								{
									type: "text",
									text: "Transcribe the audio exactly as spoken. Output ONLY the transcribed text, nothing else. The audio is most likely in Arabic (Lebanese dialect), but transcribe in whatever language is spoken.",
								},
							],
						},
					],
				}),
			},
		);

		if (!response.ok) {
			const errorText = await response.text();
			logger.error("OpenRouter transcription API error", {
				status: response.status,
				error: errorText,
			});
			return null;
		}

		const data = (await response.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const text = data.choices?.[0]?.message?.content?.trim();
		if (text) {
			logger.info("Audio transcription succeeded", {
				length: text.length,
				preview: text.slice(0, 80),
			});
		} else {
			logger.warn("Audio transcription returned empty text", {
				choices: data.choices?.length ?? 0,
			});
		}
		return text || null;
	} catch (error) {
		logger.error("Transcription error", { error });
		return null;
	}
}

/**
 * Describe an image using AI SDK + OpenRouter (GPT-4.1-mini vision).
 * Optimized for ISP-related content: bills, invoices, receipts, network diagrams,
 * router screenshots, and general customer photos.
 */
export async function describeImage(
	apiToken: string,
	mediaId: string,
	caption?: string,
	rawMediaPayload?: string,
	userLanguageHint?: string,
): Promise<string | null> {
	const media = await downloadMedia(apiToken, mediaId, rawMediaPayload);
	if (!media) {
		return null;
	}

	try {
		const languageInstruction = userLanguageHint
			? `IMPORTANT: Respond in the same language as this text: "${userLanguageHint}". `
			: "";

		const systemPrompt =
			"You are a vision assistant for an ISP (Internet Service Provider) customer support agent. " +
			"Your job is to describe images so a text-only assistant can understand and respond to the customer. " +
			`${languageInstruction}` +
			"If the image contains text (bills, invoices, receipts, contracts, error messages, router screens), " +
			"extract the text VERBATIM — especially amounts, dates, account/reference numbers, plan names, and due dates. " +
			"If the image shows network equipment, router status pages, speed tests, or error screens, describe the status and any readings. " +
			"For general photos, describe concisely. Always be factual and structured.";

		const userPrompt = caption
			? `The customer sent this image with caption: "${caption}". Analyze it following your instructions.`
			: "The customer sent this image. Analyze it following your instructions.";

		const { text } = await generateText({
			model: getModel("gpt-4.1-mini"),
			system: systemPrompt,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image",
							image: media.buffer,
							mediaType: media.contentType,
						},
						{
							type: "text",
							text: userPrompt,
						},
					],
				},
			],
			maxOutputTokens: 800,
		});

		return text || null;
	} catch (error) {
		logger.error("Image description error", { error });
		return null;
	}
}

/**
 * Describe a document (PDF) using AI SDK + OpenRouter (GPT-4.1-mini vision).
 * Sends the PDF as a file part for native document understanding.
 * Limited to 100 pages / 30MB.
 */
export async function describeDocument(
	apiToken: string,
	mediaId: string,
	fileName?: string,
	rawMediaPayload?: string,
	userLanguageHint?: string,
): Promise<string | null> {
	const media = await downloadMedia(apiToken, mediaId, rawMediaPayload);
	if (!media) {
		return null;
	}

	// Only process PDFs — other document types are not supported by vision
	const isPdf =
		media.contentType.includes("pdf") ||
		(fileName?.toLowerCase().endsWith(".pdf") ?? false);
	if (!isPdf) {
		return `[Document: ${fileName ?? "unknown file"}] (non-PDF document — content not extracted)`;
	}

	// Reject files larger than 30MB (API limit is 32MB across all inputs)
	if (media.buffer.length > 30 * 1024 * 1024) {
		logger.warn("PDF too large for vision API", {
			size: media.buffer.length,
			fileName,
		});
		return `[Document: ${fileName ?? "PDF"}] (file too large to process — ${Math.round(media.buffer.length / 1024 / 1024)}MB)`;
	}

	try {
		const languageInstruction = userLanguageHint
			? `IMPORTANT: Respond in the same language as this text: "${userLanguageHint}". `
			: "";

		const systemPrompt =
			"You are a document analysis assistant for an ISP (Internet Service Provider) customer support agent. " +
			"Your job is to extract and summarize document content so a text-only assistant can understand and respond. " +
			`${languageInstruction}` +
			"Extract ALL text verbatim from the document — especially amounts, dates, account/reference numbers, plan names, " +
			"due dates, payment details, and any terms or conditions. " +
			"Organize the extracted information in a clear, structured format. Be thorough but concise.";

		const userPrompt = fileName
			? `The customer sent a PDF document: "${fileName}". Extract and summarize its contents following your instructions.`
			: "The customer sent a PDF document. Extract and summarize its contents following your instructions.";

		const { text } = await generateText({
			model: getModel("gpt-4.1-mini"),
			system: systemPrompt,
			messages: [
				{
					role: "user",
					content: [
						{
							type: "file",
							mediaType: "application/pdf",
							data: media.buffer,
						},
						{
							type: "text",
							text: userPrompt,
						},
					],
				},
			],
			maxOutputTokens: 1500,
		});

		return text || null;
	} catch (error) {
		logger.error("Document description error", { error });
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

// ─── Webhook Event Parsing (Receipts, Reactions, Deletions) ───

export interface ReceiptUpdate {
	messageId: string;
	chatId: string;
	status: "delivered" | "read";
}

export interface ReactionEvent {
	messageId: string;
	chatId: string;
	emoji: string;
	contactId?: string | undefined;
	isRemoval: boolean;
}

export interface DeleteEvent {
	messageId: string;
	chatId: string;
}

/**
 * Parse receipt update events from WaSender webhook.
 * Event: "message-receipt-update"
 */
export function parseReceiptUpdate(body: unknown): ReceiptUpdate[] {
	const payload = body as WaSenderWebhookPayload;
	if (
		payload.event !== "message-receipt-update" &&
		payload.event !== "messages.update"
	) {
		return [];
	}

	const data = payload.data as Record<string, unknown> | undefined;
	if (!data) {
		return [];
	}

	const results: ReceiptUpdate[] = [];

	// WaSender receipt format varies; handle common shapes
	const updates = (data["updates"] ?? data["messages"]) as
		| Array<Record<string, unknown>>
		| undefined;
	if (Array.isArray(updates)) {
		for (const update of updates) {
			const key = update["key"] as WaSenderMessageKey | undefined;
			const status = update["status"] as string | number | undefined;
			if (key?.id && key.remoteJid) {
				let deliveryStatus: "delivered" | "read" | null = null;
				// WaSender uses numeric status: 3 = delivered, 4 = read
				if (status === 3 || status === "delivered") {
					deliveryStatus = "delivered";
				} else if (status === 4 || status === "read") {
					deliveryStatus = "read";
				}
				if (deliveryStatus) {
					results.push({
						messageId: key.id,
						chatId: key.remoteJid,
						status: deliveryStatus,
					});
				}
			}
		}
	}

	return results;
}

/**
 * Parse reaction events from WaSender webhook.
 * Event: "messages.reaction"
 */
export function parseReactionEvent(body: unknown): ReactionEvent[] {
	const payload = body as WaSenderWebhookPayload;
	if (payload.event !== "messages.reaction") {
		return [];
	}

	const data = payload.data as Record<string, unknown> | undefined;
	if (!data) {
		return [];
	}

	const results: ReactionEvent[] = [];
	const reactions = (data["reactions"] ?? (data["messages"] ? [data] : [])) as
		| Array<Record<string, unknown>>
		| undefined;

	if (Array.isArray(reactions)) {
		for (const reaction of reactions) {
			const key = reaction["key"] as WaSenderMessageKey | undefined;
			const reactionData = reaction["reaction"] as
				| Record<string, unknown>
				| undefined;
			if (key?.id && key.remoteJid && reactionData) {
				const emoji = (reactionData["text"] ?? "") as string;
				results.push({
					messageId: key.id,
					chatId: key.remoteJid,
					emoji,
					contactId: key.cleanedSenderPn ?? key.senderPn,
					isRemoval: !emoji,
				});
			}
		}
	}

	return results;
}

/**
 * Parse message deletion events from WaSender webhook.
 * Event: "messages.delete"
 */
export function parseDeleteEvent(body: unknown): DeleteEvent[] {
	const payload = body as WaSenderWebhookPayload;
	if (payload.event !== "messages.delete") {
		return [];
	}

	const data = payload.data as Record<string, unknown> | undefined;
	if (!data) {
		return [];
	}

	const results: DeleteEvent[] = [];
	const deletions = (data["messages"] ?? [data]) as
		| Array<Record<string, unknown>>
		| undefined;

	if (Array.isArray(deletions)) {
		for (const deletion of deletions) {
			const key = deletion["key"] as WaSenderMessageKey | undefined;
			if (key?.id && key.remoteJid) {
				results.push({
					messageId: key.id,
					chatId: key.remoteJid,
				});
			}
		}
	}

	return results;
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
			webhook_events: [
				"messages.upsert",
				"messages.update",
				"messages.reaction",
				"messages.delete",
			],
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
