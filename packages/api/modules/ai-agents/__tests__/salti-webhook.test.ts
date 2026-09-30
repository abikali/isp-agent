import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { queueSaltiInbound } = vi.hoisted(() => ({
	queueSaltiInbound: vi.fn(),
}));

vi.mock("@repo/jobs", () => ({ queueSaltiInbound }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { isValidSaltiSecret, saltiWebhookHandler } from "../lib/salti-webhook";

/** A quick-reply tap as WPBox forwards it (Meta's raw Cloud-API body). */
const BUTTON_TAP = {
	object: "whatsapp_business_account",
	entry: [
		{
			id: "WABA",
			changes: [
				{
					field: "messages",
					value: {
						messaging_product: "whatsapp",
						metadata: { phone_number_id: "PNID" },
						messages: [
							{
								from: "96170123456",
								id: "wamid.IN",
								type: "button",
								button: {
									payload: "fu_ck1_travel",
									text: "مسافر / توقيف مؤقت",
								},
							},
						],
					},
				},
			],
		},
	],
};

function post(secret: string, body: unknown) {
	return saltiWebhookHandler(
		new Request(`https://cp.example.com/api/webhooks/salti/${secret}`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: typeof body === "string" ? body : JSON.stringify(body),
		}),
		secret,
	);
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.stubEnv("SALTI_WEBHOOK_SECRET", "s3cret-value");
	queueSaltiInbound.mockResolvedValue("job-1");
});

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("saltiWebhookHandler", () => {
	it("answers 404 to a wrong secret and queues nothing", async () => {
		const response = await post("wrong", BUTTON_TAP);
		expect(response.status).toBe(404);
		expect(queueSaltiInbound).not.toHaveBeenCalled();
	});

	it("answers 404 while no secret is configured", async () => {
		vi.stubEnv("SALTI_WEBHOOK_SECRET", "");
		expect((await post("", BUTTON_TAP)).status).toBe(404);
	});

	it("queues a button tap and answers 200 at once", async () => {
		const response = await post("s3cret-value", BUTTON_TAP);
		expect(response.status).toBe(200);
		expect(queueSaltiInbound).toHaveBeenCalledWith(BUTTON_TAP);
	});

	it("queues status-only bodies too (delivery failures)", async () => {
		const body = {
			entry: [
				{
					changes: [
						{
							value: {
								statuses: [
									{ id: "wamid.X", status: "delivered" },
								],
							},
						},
					],
				},
			],
		};
		expect((await post("s3cret-value", body)).status).toBe(200);
		expect(queueSaltiInbound).toHaveBeenCalledWith(body);
	});

	it("still answers 200 when the body is not JSON or the queue is down", async () => {
		expect((await post("s3cret-value", "not json")).status).toBe(200);
		expect(queueSaltiInbound).not.toHaveBeenCalled();
		queueSaltiInbound.mockRejectedValue(new Error("redis down"));
		expect((await post("s3cret-value", BUTTON_TAP)).status).toBe(200);
	});
});

describe("isValidSaltiSecret", () => {
	it("compares in constant time and rejects length mismatches", () => {
		expect(isValidSaltiSecret("abc", "abc")).toBe(true);
		expect(isValidSaltiSecret("abcd", "abc")).toBe(false);
		expect(isValidSaltiSecret("abc", undefined)).toBe(false);
	});
});
