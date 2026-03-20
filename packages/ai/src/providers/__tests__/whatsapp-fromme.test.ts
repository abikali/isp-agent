/**
 * Tests for WhatsApp fromMe message parsing — critical for human takeover detection.
 *
 * These tests use realistic WaSender webhook payloads based on the actual SDK types
 * (WaSenderMessageKey, WaSenderMessage, WaSenderWebhookPayload) to verify that:
 * 1. fromMe text echoes include the actual message text (not empty string)
 * 2. fromMe voice/image/sticker messages are flagged correctly
 * 3. Non-message events are ignored
 *
 * This is the parsing layer — it's the foundation for human takeover detection.
 * If extractMessage returns empty text for fromMe, the fingerprint check can't work.
 */
import { describe, expect, it } from "vitest";
import { parseWebhookPayload } from "../whatsapp";

// ── Realistic WaSender Webhook Payloads ──────────────────────────────

/**
 * Bot-sent text message echo.
 * The bot sends via API → WaSender sends it → WhatsApp echoes it back
 * via messages.upsert with fromMe: true.
 *
 * Key detail: the ID format here (hex) differs from what the send API
 * returns (numeric). This is why ID-based echo detection fails.
 */
const BOT_TEXT_ECHO_PAYLOAD = {
	event: "messages.upsert",
	timestamp: 1711000000,
	data: {
		messages: [
			{
				key: {
					id: "3EB0D75251003A853087B6",
					fromMe: true,
					remoteJid: "96176538947@s.whatsapp.net",
				},
				messageBody: "Hello! How can I help you today?",
				message: {
					conversation: "Hello! How can I help you today?",
				},
				messageTimestamp: 1711000000,
			},
		],
	},
};

/**
 * Human-sent text message from the phone.
 * The human types on their WhatsApp phone/web → arrives as fromMe: true.
 * Indistinguishable from bot echo at the protocol level — only content
 * fingerprinting can tell them apart.
 */
const HUMAN_TEXT_FROM_PHONE_PAYLOAD = {
	event: "messages.upsert",
	timestamp: 1711000100,
	data: {
		messages: [
			{
				key: {
					id: "3EB0ABCDEF123456789012",
					fromMe: true,
					remoteJid: "96176538947@s.whatsapp.net",
				},
				messageBody: "I'll handle this customer, please wait",
				message: {
					conversation: "I'll handle this customer, please wait",
				},
				messageTimestamp: 1711000100,
			},
		],
	},
};

/**
 * Human-sent voice note from phone.
 * No text content — only audioMessage with media metadata.
 * The bot NEVER sends voice messages, so any fromMe voice = human.
 */
const HUMAN_VOICE_FROM_PHONE_PAYLOAD = {
	event: "messages.upsert",
	timestamp: 1711000200,
	data: {
		messages: [
			{
				key: {
					id: "3EB0VOICE99887766554433",
					fromMe: true,
					remoteJid: "96176538947@s.whatsapp.net",
				},
				message: {
					audioMessage: {
						mimetype: "audio/ogg; codecs=opus",
						fileLength: "12345",
						directPath: "/v/t62.xxxxx",
						mediaKey: "base64key==",
					},
				},
				messageTimestamp: 1711000200,
			},
		],
	},
};

/**
 * Human-sent image from phone.
 * Has imageMessage with optional caption. Bot never sends images.
 */
const HUMAN_IMAGE_FROM_PHONE_PAYLOAD = {
	event: "messages.upsert",
	timestamp: 1711000300,
	data: {
		messages: [
			{
				key: {
					id: "3EB0IMAGE11223344556677",
					fromMe: true,
					remoteJid: "96176538947@s.whatsapp.net",
				},
				message: {
					imageMessage: {
						mimetype: "image/jpeg",
						caption: "Check this router status",
						fileLength: "54321",
						directPath: "/v/t62.yyyyy",
						mediaKey: "anotherkey==",
					},
				},
				messageTimestamp: 1711000300,
			},
		],
	},
};

/**
 * Human-sent sticker from phone.
 * Stickers have no text representation.
 */
const HUMAN_STICKER_FROM_PHONE_PAYLOAD = {
	event: "messages.upsert",
	timestamp: 1711000400,
	data: {
		messages: [
			{
				key: {
					id: "3EB0STICKER1234567890AB",
					fromMe: true,
					remoteJid: "96176538947@s.whatsapp.net",
				},
				message: {
					stickerMessage: {
						mimetype: "image/webp",
						directPath: "/v/t62.zzzzz",
					},
				},
				messageTimestamp: 1711000400,
			},
		],
	},
};

/**
 * Normal incoming customer message (NOT fromMe).
 * This is what triggers AI response.
 */
const CUSTOMER_MESSAGE_PAYLOAD = {
	event: "messages.upsert",
	timestamp: 1711000500,
	data: {
		messages: [
			{
				key: {
					id: "3EB0CUSTOMER123456789",
					fromMe: false,
					remoteJid: "96171234567@s.whatsapp.net",
					cleanedSenderPn: "96171234567",
				},
				messageBody: "My internet is slow",
				message: {
					conversation: "My internet is slow",
				},
				pushName: "Ahmad",
				messageTimestamp: 1711000500,
			},
		],
	},
};

/**
 * Non-message event — should return empty array.
 */
const RECEIPT_UPDATE_PAYLOAD = {
	event: "message-receipt-update",
	timestamp: 1711000600,
	data: {
		updates: [
			{
				key: { id: "msg-123", remoteJid: "chat-1", fromMe: true },
				status: 4,
			},
		],
	},
};

/**
 * JID format mismatch scenario.
 * The bot sends to 142378635661318@lid but the echo arrives from
 * 96176538947@s.whatsapp.net — different JID for the same chat.
 */
const LID_FORMAT_ECHO_PAYLOAD = {
	event: "messages.upsert",
	timestamp: 1711000700,
	data: {
		messages: [
			{
				key: {
					id: "3EB0LID1234567890ABCDEF",
					fromMe: true,
					remoteJid: "142378635661318@lid",
				},
				messageBody: "Your account is active",
				message: {
					conversation: "Your account is active",
				},
				messageTimestamp: 1711000700,
			},
		],
	},
};

// ── Tests ────────────────────────────────────────────────────────────

describe("WhatsApp fromMe Parsing — Foundation for Human Takeover", () => {
	describe("Text message echoes", () => {
		it("extracts actual text from bot text echo (NOT empty string)", () => {
			const messages = parseWebhookPayload(BOT_TEXT_ECHO_PAYLOAD);

			expect(messages).toHaveLength(1);
			expect(messages[0]?.fromMe).toBe(true);
			// CRITICAL: text must contain the actual message content,
			// not empty string. This is what makes fingerprint matching work.
			expect(messages[0]?.text).toBe("Hello! How can I help you today?");
			expect(messages[0]?.chatId).toBe("96176538947@s.whatsapp.net");
		});

		it("extracts text from human-sent message (same structure as bot echo)", () => {
			const messages = parseWebhookPayload(HUMAN_TEXT_FROM_PHONE_PAYLOAD);

			expect(messages).toHaveLength(1);
			expect(messages[0]?.fromMe).toBe(true);
			expect(messages[0]?.text).toBe(
				"I'll handle this customer, please wait",
			);
		});

		it("extracts text from @lid JID format (used by some WhatsApp accounts)", () => {
			const messages = parseWebhookPayload(LID_FORMAT_ECHO_PAYLOAD);

			expect(messages).toHaveLength(1);
			expect(messages[0]?.fromMe).toBe(true);
			expect(messages[0]?.text).toBe("Your account is active");
			expect(messages[0]?.chatId).toBe("142378635661318@lid");
		});
	});

	describe("Media messages from phone (no text — must still be detected)", () => {
		it("parses fromMe voice note with descriptive text placeholder", () => {
			const messages = parseWebhookPayload(
				HUMAN_VOICE_FROM_PHONE_PAYLOAD,
			);

			expect(messages).toHaveLength(1);
			expect(messages[0]?.fromMe).toBe(true);
			// Voice has no conversational text — extractMessage returns
			// a placeholder like "[Voice message received]"
			expect(messages[0]?.text).toBeTruthy();
			expect(messages[0]?.messageId).toBe("3EB0VOICE99887766554433");
		});

		it("parses fromMe image with caption as text", () => {
			const messages = parseWebhookPayload(
				HUMAN_IMAGE_FROM_PHONE_PAYLOAD,
			);

			expect(messages).toHaveLength(1);
			expect(messages[0]?.fromMe).toBe(true);
			// Image with caption should include the caption text
			expect(messages[0]?.text).toContain("Check this router status");
		});

		it("parses fromMe sticker (no text content)", () => {
			const messages = parseWebhookPayload(
				HUMAN_STICKER_FROM_PHONE_PAYLOAD,
			);

			expect(messages).toHaveLength(1);
			expect(messages[0]?.fromMe).toBe(true);
			// Sticker has descriptive placeholder
			expect(messages[0]?.text).toContain("Sticker");
		});
	});

	describe("Non-fromMe messages (normal customer flow)", () => {
		it("parses incoming customer message correctly", () => {
			const messages = parseWebhookPayload(CUSTOMER_MESSAGE_PAYLOAD);

			expect(messages).toHaveLength(1);
			expect(messages[0]?.fromMe).toBeUndefined();
			expect(messages[0]?.text).toBe("My internet is slow");
			expect(messages[0]?.contactName).toBe("Ahmad");
			expect(messages[0]?.contactId).toBe("96171234567");
		});
	});

	describe("Non-message events", () => {
		it("returns empty array for receipt updates", () => {
			const messages = parseWebhookPayload(RECEIPT_UPDATE_PAYLOAD);
			expect(messages).toHaveLength(0);
		});

		it("returns empty array for missing data", () => {
			const messages = parseWebhookPayload({
				event: "messages.upsert",
			});
			expect(messages).toHaveLength(0);
		});
	});
});
