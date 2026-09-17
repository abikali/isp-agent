import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendWhatsAppMaintenanceVisit, sendWPBoxTemplate } from "../wpbox";

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
			error: "API returned 200",
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
			error: "API returned 503",
			retriable: true,
		});
	});

	it("marks 4xx as permanent", async () => {
		mockFetch.mockResolvedValue(new Response("Not Found", { status: 404 }));

		const result = await send();

		expect(result).toMatchObject({
			ok: false,
			status: 404,
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
