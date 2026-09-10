import { describe, expect, it } from "vitest";
import { parseWebhookPayload } from "../whatsapp";

const VCARD =
	"BEGIN:VCARD\nVERSION:3.0\nN:;Abou Ali;;;\nFN:Abou Ali\nitem1.TEL;waid=96170123456:+961 70 123 456\nitem1.X-ABLabel:Mobile\nitem2.TEL;waid=96103987654:+961 3 987 654\nEND:VCARD";

function payload(message: Record<string, unknown>) {
	return {
		event: "messages.upsert",
		timestamp: 1711000000,
		data: {
			messages: [
				{
					key: {
						id: "3EB0CONTACT0001",
						fromMe: false,
						remoteJid: "96176538947@s.whatsapp.net",
					},
					message,
					messageTimestamp: 1711000000,
				},
			],
		},
	};
}

describe("shared contacts", () => {
	it("reads the name and every number out of a single contact card", () => {
		const [msg] = parseWebhookPayload(
			payload({
				contactMessage: { displayName: "Abou Ali", vcard: VCARD },
			}),
		);
		expect(msg?.mediaType).toBe("contact");
		expect(msg?.contacts).toEqual([
			{
				name: "Abou Ali",
				numbers: ["+961 70 123 456", "+961 3 987 654"],
			},
		]);
		expect(msg?.text).toBe(
			"[Contact] Abou Ali — +961 70 123 456, +961 3 987 654",
		);
	});

	it("handles a contacts array and falls back to the vCard FN for the name", () => {
		const [msg] = parseWebhookPayload(
			payload({
				contactsArrayMessage: {
					displayName: "2 contacts",
					contacts: [
						{ vcard: VCARD },
						{
							displayName: "Landlord",
							vcard: "BEGIN:VCARD\nTEL:03111222\nEND:VCARD",
						},
					],
				},
			}),
		);
		expect(msg?.contacts?.map((c) => c.name)).toEqual([
			"Abou Ali",
			"Landlord",
		]);
		expect(msg?.contacts?.[1]?.numbers).toEqual(["03111222"]);
		expect(msg?.text.split("\n")).toHaveLength(2);
	});

	it("keeps the old placeholder when the card carries nothing usable", () => {
		const [msg] = parseWebhookPayload(payload({ contactMessage: {} }));
		expect(msg?.text).toBe("[Contact shared]");
		expect(msg?.mediaType).toBeUndefined();
	});
});
