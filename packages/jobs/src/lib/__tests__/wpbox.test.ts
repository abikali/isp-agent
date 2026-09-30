import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
	quickReplyButtons,
	sendWhatsAppDealerAccountUpdate,
	sendWhatsAppExpiryReminder,
	sendWhatsAppMaintenanceVisit,
	sendWhatsAppStopNotice,
	sendWPBoxMessage,
	sendWPBoxTemplate,
} from "../wpbox";

const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function send(
	overrides: Partial<Parameters<typeof sendWPBoxTemplate>[0]> = {},
) {
	return sendWPBoxTemplate({
		phone: "71123456",
		templateName: "success_payment_url_v2",
		components: [],
		logContext: {},
		logTag: "[Test]",
		...overrides,
	});
}

function sentPayload(): Record<string, unknown> {
	const init = mockFetch.mock.calls[0]?.[1] as RequestInit | undefined;
	return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("sendWPBoxTemplate", () => {
	beforeEach(() => {
		vi.stubEnv("WPBOX_TOKEN", "test-token");
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("succeeds only on a success body and returns the message id", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ status: "success", message_id: 4821 }),
		);

		const result = await send();

		expect(result).toEqual({
			ok: true,
			phone: "96171123456",
			status: 200,
			messageId: "4821",
		});
		expect(sentPayload()).toMatchObject({
			token: "test-token",
			phone: "96171123456",
			template_name: "success_payment_url_v2",
			template_language: "en_US",
		});
	});

	it("fails on HTTP 200 with status error (unknown template)", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ status: "error", message: "Invalid template" }),
		);

		const result = await send({ templateName: "maintenance_visit" });

		expect(result).toEqual({
			ok: false,
			phone: "96171123456",
			status: 200,
			error: "Invalid template",
			retriable: false,
		});
	});

	it("prefers the WhatsApp error code and message", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({
				status: "error",
				message: "Message not sent",
				wa_error_code: "132012",
				error_message: "Parameter format does not match",
			}),
		);

		const result = await send();

		expect(result).toMatchObject({
			ok: false,
			error: "132012: Parameter format does not match",
			retriable: false,
		});
	});

	it("treats a 2xx body without success status as a failure", async () => {
		mockFetch.mockResolvedValue(new Response("<html>ok</html>"));

		const result = await send();

		expect(result).toMatchObject({
			ok: false,
			status: 200,
			error: "API returned 200: <html>ok</html>",
			retriable: false,
		});
	});

	it("marks 5xx as retriable", async () => {
		mockFetch.mockResolvedValue(
			new Response("Service Unavailable", { status: 503 }),
		);

		const result = await send();

		expect(result).toMatchObject({
			ok: false,
			status: 503,
			error: "API returned 503: Service Unavailable",
			retriable: true,
		});
	});

	it("marks 404 and 429 as retriable (WPBox outages answer 404)", async () => {
		mockFetch.mockResolvedValue(new Response("Not Found", { status: 404 }));

		const result = await send();

		expect(result).toMatchObject({
			ok: false,
			status: 404,
			retriable: true,
		});
	});

	it("marks other 4xx as permanent", async () => {
		mockFetch.mockResolvedValue(
			new Response("Bad Request", { status: 400 }),
		);

		const result = await send();

		expect(result).toMatchObject({
			ok: false,
			status: 400,
			retriable: false,
		});
	});

	it("marks timeouts / network errors as retriable", async () => {
		mockFetch.mockRejectedValue(
			new DOMException(
				"The operation was aborted due to timeout",
				"TimeoutError",
			),
		);

		const result = await send();

		expect(result).toMatchObject({ ok: false, retriable: true });
		expect("status" in result).toBe(false);
	});

	it("rejects an invalid phone without calling the API", async () => {
		const result = await send({ phone: "791745774" });

		expect(result).toEqual({
			ok: false,
			phone: "791745774",
			error: "Invalid phone number",
			retriable: false,
		});
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("skips the send when WPBOX_TOKEN is missing", async () => {
		vi.stubEnv("WPBOX_TOKEN", "");

		const result = await send();

		expect(result).toMatchObject({
			ok: false,
			error: "WPBOX_TOKEN not set",
		});
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("passes the template language through", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ status: "success" }));

		const result = await send({
			templateLanguage: "ar",
			phone: "+96103123456",
		});

		expect(result).toMatchObject({ ok: true, messageId: null });
		expect(sentPayload()).toMatchObject({
			phone: "9613123456",
			template_language: "ar",
		});
	});
});

describe("sendWhatsAppMaintenanceVisit", () => {
	beforeEach(() => {
		vi.stubEnv("WPBOX_TOKEN", "test-token");
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("falls back to Arabic wording when names are missing", async () => {
		mockFetch.mockResolvedValue(jsonResponse({ status: "success" }));

		await sendWhatsAppMaintenanceVisit({ phone: "03123456" });

		expect(sentPayload()).toMatchObject({
			components: [
				{
					type: "body",
					parameters: [
						{ type: "text", text: "عزيزنا" },
						{ type: "text", text: "من فريقنا" },
						{ type: "text", text: "هذا الرقم" },
					],
				},
			],
		});
	});

	it("returns false when WPBox rejects the template", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ status: "error", message: "Invalid template" }),
		);

		const sent = await sendWhatsAppMaintenanceVisit({
			phone: "03123456",
			customerName: "Rami",
			workerName: "Walid",
			workerPhone: "70123456",
		});

		expect(sent).toBe(false);
		expect(sentPayload()).toMatchObject({
			template_name: "maintenance_visit",
			template_language: "ar",
			components: [
				{
					type: "body",
					parameters: [
						{ type: "text", text: "Rami" },
						{ type: "text", text: "Walid" },
						{ type: "text", text: "70123456" },
					],
				},
			],
		});
	});
});

describe("sendWhatsAppDealerAccountUpdate", () => {
	beforeEach(() => {
		vi.stubEnv("WPBOX_TOKEN", "test-token");
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("sends the Arabic template with the params as body text", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ status: "success", message_id: "wamid-9" }),
		);
		const params = [
			"MATAR NET",
			"دفعة",
			"$100.00",
			"2026-09-17",
			"$50.00",
			"$0.00",
			"-",
		];

		const result = await sendWhatsAppDealerAccountUpdate({
			phone: "70123456",
			params,
			dealerAccountId: "entry-1",
		});

		expect(result).toMatchObject({ ok: true, messageId: "wamid-9" });
		expect(sentPayload()).toMatchObject({
			phone: "96170123456",
			template_name: "dealer_account_update",
			template_language: "ar",
			components: [
				{
					type: "body",
					parameters: params.map((text) => ({ type: "text", text })),
				},
			],
		});
	});
});

describe("quickReplyButtons", () => {
	it("builds one quick-reply component per choice with our payload", () => {
		expect(quickReplyButtons("ck1", ["good", "bad"])).toEqual([
			{
				type: "button",
				sub_type: "quick_reply",
				index: "0",
				parameters: [{ type: "payload", payload: "fu_ck1_good" }],
			},
			{
				type: "button",
				sub_type: "quick_reply",
				index: "1",
				parameters: [{ type: "payload", payload: "fu_ck1_bad" }],
			},
		]);
	});
});

describe("sendWPBoxMessage", () => {
	beforeEach(() => {
		vi.stubEnv("WPBOX_TOKEN", "test-token");
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockReset();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("posts a free-form message and returns the wamid", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({
				status: "success",
				message_id: 9,
				message_wamid: "wamid.ABC",
			}),
		);
		const result = await sendWPBoxMessage({
			phone: "70123456",
			message: "شكراً",
			buttons: [
				{ id: "a", title: "A" },
				{ id: "b", title: "B" },
				{ id: "c", title: "C" },
				{ id: "d", title: "D" },
			],
			logContext: {},
			logTag: "[Test]",
		});
		expect(result).toMatchObject({ ok: true, wamid: "wamid.ABC" });
		expect(mockFetch.mock.calls[0]?.[0]).toBe(
			"https://saltimarketing.com/api/wpbox/sendmessage",
		);
		const body = sentPayload();
		expect(body).toMatchObject({
			token: "test-token",
			phone: "96170123456",
			message: "شكراً",
		});
		expect(body["buttons"]).toHaveLength(3);
	});

	it("treats an error body as a failure", async () => {
		mockFetch.mockResolvedValue(
			jsonResponse({ status: "error", message: "Outside window" }),
		);
		const result = await sendWPBoxMessage({
			phone: "70123456",
			message: "x",
			logContext: {},
			logTag: "[Test]",
		});
		expect(result).toMatchObject({ ok: false, error: "Outside window" });
	});
});

describe("customer payment notifications", () => {
	beforeEach(() => {
		vi.stubEnv("WPBOX_TOKEN", "test-token");
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockReset();
		mockFetch.mockResolvedValue(jsonResponse({ status: "success" }));
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it("sends payment_reminder_tomorrow with the date and contact number", async () => {
		await sendWhatsAppExpiryReminder({
			phone: "70111222",
			expiryLabel: "(1/10/2026)",
			contactPhone: "76 878 870",
			notificationId: "n1",
		});

		expect(sentPayload()).toMatchObject({
			phone: "96170111222",
			template_name: "payment_reminder_tomorrow",
			template_language: "ar",
			components: [
				{
					type: "body",
					parameters: [
						{ type: "text", text: "(1/10/2026)" },
						{ type: "text", text: "76 878 870" },
					],
				},
			],
		});
	});

	it("sends stop_request_notice with the collector number", async () => {
		await sendWhatsAppStopNotice({
			phone: "70111222",
			contactPhone: "03 775 126",
			notificationId: "n2",
		});

		expect(sentPayload()).toMatchObject({
			template_name: "stop_request_notice",
			template_language: "ar",
			components: [
				{
					type: "body",
					parameters: [{ type: "text", text: "03 775 126" }],
				},
			],
		});
	});
});
