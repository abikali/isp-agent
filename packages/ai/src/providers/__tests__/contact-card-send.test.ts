import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendContact, sendLocation } = vi.hoisted(() => ({
	sendContact: vi.fn(),
	sendLocation: vi.fn(),
}));

vi.mock("wasenderapi", () => ({
	createWasender: () => ({ sendContact, sendLocation }),
}));
vi.mock("../rate-limiter", () => ({
	acquireSendSlot: vi.fn().mockResolvedValue(undefined),
	tryTypingSlot: vi.fn().mockResolvedValue(true),
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { parseWebhookPayload as parseTelegram } from "../telegram";
import { sendMediaMessage } from "../whatsapp";

beforeEach(() => {
	vi.clearAllMocks();
	sendContact.mockResolvedValue({ response: { data: { msgId: 42 } } });
});

describe("WhatsApp contact card send", () => {
	it("sends the card through WaSender's sendContact", async () => {
		const result = await sendMediaMessage("token", "96176538947@lid", {
			mediaType: "contact",
			contact: { name: "Walid technician", phone: "+96170123456" },
		});
		expect(sendContact).toHaveBeenCalledWith({
			to: "96176538947@lid",
			contact: { name: "Walid technician", phone: "+96170123456" },
		});
		expect(result).toEqual({ success: true, messageId: "42" });
	});

	it("refuses a contact send without a card", async () => {
		const result = await sendMediaMessage("token", "96176538947@lid", {
			mediaType: "contact",
		});
		expect(sendContact).not.toHaveBeenCalled();
		expect(result).toEqual({ success: false });
	});
});

describe("Telegram contact card parse", () => {
	it("reads a shared contact into the same shape as WhatsApp cards", () => {
		const [msg] = parseTelegram({
			update_id: 1,
			message: {
				message_id: 7,
				date: 1711000000,
				chat: { id: 555, type: "private" },
				from: { id: 555, is_bot: false, first_name: "Ahmad" },
				contact: {
					phone_number: "+96170123456",
					first_name: "Walid",
					last_name: "Tech",
				},
			},
		});
		expect(msg?.mediaType).toBe("contact");
		expect(msg?.contacts).toEqual([
			{ name: "Walid Tech", numbers: ["+96170123456"] },
		]);
		expect(msg?.text).toBe("[Contact] Walid Tech — +96170123456");
	});
});
