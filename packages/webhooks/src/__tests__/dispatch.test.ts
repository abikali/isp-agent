import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("node:crypto", () => ({
	randomUUID: vi.fn(() => "uuid-123-456"),
}));

vi.mock("@repo/database", () => ({
	db: {
		webhook: {
			findMany: vi.fn(),
		},
		webhookDelivery: {
			create: vi.fn(),
			findUnique: vi.fn(),
			update: vi.fn(),
		},
	},
}));

vi.mock("@paralleldrive/cuid2", () => ({
	createId: vi.fn(() => "cuid_123"),
}));

vi.mock("../sign", () => ({
	signWebhookPayload: vi.fn(() => "test_signature"),
}));

// Import after mocking
import { db } from "@repo/database";
import { dispatchWebhooks, retryWebhookDelivery } from "../dispatch";
import { signWebhookPayload } from "../sign";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("dispatchWebhooks", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns empty array when no webhooks subscribe to event", async () => {
		vi.mocked(db.webhook.findMany).mockResolvedValue([]);

		const results = await dispatchWebhooks({
			organizationId: "org_123",
			event: "user.created",
			data: { userId: "user_456" },
		});

		expect(results).toEqual([]);
		expect(db.webhook.findMany).toHaveBeenCalledWith({
			where: {
				organizationId: "org_123",
				enabled: true,
				events: { has: "user.created" },
			},
		});
	});

	it("dispatches to multiple webhooks in parallel", async () => {
		vi.mocked(db.webhook.findMany).mockResolvedValue([
			{
				id: "webhook_1",
				url: "https://example1.com/hook",
				secret: "secret_1",
				enabled: true,
				events: ["user.created"],
			},
			{
				id: "webhook_2",
				url: "https://example2.com/hook",
				secret: "secret_2",
				enabled: true,
				events: ["user.created"],
			},
		] as never);

		vi.mocked(db.webhookDelivery.create).mockResolvedValue({
			id: "cuid_123",
		} as never);

		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve("OK"),
		});

		const resultsPromise = dispatchWebhooks({
			organizationId: "org_123",
			event: "user.created",
			data: { userId: "user_456" },
		});

		await vi.runAllTimersAsync();
		const results = await resultsPromise;

		expect(results).toHaveLength(2);
		expect(results[0]).toEqual({
			webhookId: "webhook_1",
			success: true,
			statusCode: 200,
		});
		expect(results[1]).toEqual({
			webhookId: "webhook_2",
			success: true,
			statusCode: 200,
		});
	});

	it("builds correct payload structure", async () => {
		vi.mocked(db.webhook.findMany).mockResolvedValue([
			{
				id: "webhook_1",
				url: "https://example.com/hook",
				secret: "secret_1",
				enabled: true,
				events: ["user.created"],
			},
		] as never);

		vi.mocked(db.webhookDelivery.create).mockResolvedValue({
			id: "cuid_123",
		} as never);

		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve("OK"),
		});

		const resultsPromise = dispatchWebhooks({
			organizationId: "org_123",
			event: "user.created",
			data: { userId: "user_456", name: "John" },
		});

		await vi.runAllTimersAsync();
		await resultsPromise;

		const fetchCall = mockFetch.mock.calls[0];
		const body = JSON.parse(fetchCall?.[1]?.body as string);

		expect(body).toMatchObject({
			id: "uuid-123-456",
			event: "user.created",
			timestamp: expect.any(String),
			data: { userId: "user_456", name: "John" },
		});
	});

	it("creates delivery record before sending", async () => {
		vi.mocked(db.webhook.findMany).mockResolvedValue([
			{
				id: "webhook_1",
				url: "https://example.com/hook",
				secret: "secret_1",
				enabled: true,
				events: ["user.created"],
			},
		] as never);

		vi.mocked(db.webhookDelivery.create).mockResolvedValue({
			id: "cuid_123",
		} as never);

		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve("OK"),
		});

		const resultsPromise = dispatchWebhooks({
			organizationId: "org_123",
			event: "user.created",
			data: {},
		});

		await vi.runAllTimersAsync();
		await resultsPromise;

		expect(db.webhookDelivery.create).toHaveBeenCalledWith({
			data: {
				id: "cuid_123",
				webhookId: "webhook_1",
				event: "user.created",
				payload: expect.objectContaining({ event: "user.created" }),
				attempts: 0,
			},
		});
	});

	it("sends correct headers including signature", async () => {
		vi.mocked(db.webhook.findMany).mockResolvedValue([
			{
				id: "webhook_1",
				url: "https://example.com/hook",
				secret: "my_secret",
				enabled: true,
				events: ["user.created"],
			},
		] as never);

		vi.mocked(db.webhookDelivery.create).mockResolvedValue({
			id: "delivery_123",
		} as never);

		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve("OK"),
		});

		const resultsPromise = dispatchWebhooks({
			organizationId: "org_123",
			event: "user.created",
			data: {},
		});

		await vi.runAllTimersAsync();
		await resultsPromise;

		expect(signWebhookPayload).toHaveBeenCalledWith(
			expect.any(String),
			"my_secret",
		);
		expect(mockFetch).toHaveBeenCalledWith(
			"https://example.com/hook",
			expect.objectContaining({
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Webhook-Signature": "test_signature",
					"X-Webhook-Id": "delivery_123",
				},
			}),
		);
	});

	describe("retry logic", () => {
		it("retries on failure with correct delays", async () => {
			vi.mocked(db.webhook.findMany).mockResolvedValue([
				{
					id: "webhook_1",
					url: "https://example.com/hook",
					secret: "secret_1",
					enabled: true,
					events: ["user.created"],
				},
			] as never);

			vi.mocked(db.webhookDelivery.create).mockResolvedValue({
				id: "cuid_123",
			} as never);

			// Fail first 3 times, succeed on 4th (last retry)
			mockFetch
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					text: () => Promise.resolve("Error"),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					text: () => Promise.resolve("Error"),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
					text: () => Promise.resolve("Error"),
				})
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					text: () => Promise.resolve("OK"),
				});

			const resultsPromise = dispatchWebhooks({
				organizationId: "org_123",
				event: "user.created",
				data: {},
			});

			// First attempt (immediate)
			await vi.advanceTimersByTimeAsync(0);
			expect(mockFetch).toHaveBeenCalledTimes(1);

			// First retry after 1s
			await vi.advanceTimersByTimeAsync(1000);
			expect(mockFetch).toHaveBeenCalledTimes(2);

			// Second retry after 5s
			await vi.advanceTimersByTimeAsync(5000);
			expect(mockFetch).toHaveBeenCalledTimes(3);

			// Third retry after 30s
			await vi.advanceTimersByTimeAsync(30000);
			expect(mockFetch).toHaveBeenCalledTimes(4);

			const results = await resultsPromise;
			expect(results[0]).toEqual({
				webhookId: "webhook_1",
				success: true,
				statusCode: 200,
			});
		});

		it("returns failure after max retries exhausted", async () => {
			vi.mocked(db.webhook.findMany).mockResolvedValue([
				{
					id: "webhook_1",
					url: "https://example.com/hook",
					secret: "secret_1",
					enabled: true,
					events: ["user.created"],
				},
			] as never);

			vi.mocked(db.webhookDelivery.create).mockResolvedValue({
				id: "cuid_123",
			} as never);

			// Always fail
			mockFetch.mockResolvedValue({
				ok: false,
				status: 503,
				text: () => Promise.resolve("Service Unavailable"),
			});

			const resultsPromise = dispatchWebhooks({
				organizationId: "org_123",
				event: "user.created",
				data: {},
			});

			await vi.runAllTimersAsync();
			const results = await resultsPromise;

			// 1 initial + 3 retries = 4 total attempts
			expect(mockFetch).toHaveBeenCalledTimes(4);
			expect(results[0]).toEqual({
				webhookId: "webhook_1",
				success: false,
				statusCode: 503,
				error: "HTTP 503",
			});
		});

		it("handles network errors with retry", async () => {
			vi.mocked(db.webhook.findMany).mockResolvedValue([
				{
					id: "webhook_1",
					url: "https://example.com/hook",
					secret: "secret_1",
					enabled: true,
					events: ["user.created"],
				},
			] as never);

			vi.mocked(db.webhookDelivery.create).mockResolvedValue({
				id: "cuid_123",
			} as never);

			mockFetch
				.mockRejectedValueOnce(new Error("Connection refused"))
				.mockResolvedValueOnce({
					ok: true,
					status: 200,
					text: () => Promise.resolve("OK"),
				});

			const resultsPromise = dispatchWebhooks({
				organizationId: "org_123",
				event: "user.created",
				data: {},
			});

			await vi.runAllTimersAsync();
			const results = await resultsPromise;

			expect(results[0]).toEqual({
				webhookId: "webhook_1",
				success: true,
				statusCode: 200,
			});
		});
	});

	describe("delivery record updates", () => {
		it("updates delivery record on successful delivery", async () => {
			vi.mocked(db.webhook.findMany).mockResolvedValue([
				{
					id: "webhook_1",
					url: "https://example.com/hook",
					secret: "secret_1",
					enabled: true,
					events: ["user.created"],
				},
			] as never);

			vi.mocked(db.webhookDelivery.create).mockResolvedValue({
				id: "delivery_123",
			} as never);

			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				text: () => Promise.resolve("Response body"),
			});

			const resultsPromise = dispatchWebhooks({
				organizationId: "org_123",
				event: "user.created",
				data: {},
			});

			await vi.runAllTimersAsync();
			await resultsPromise;

			expect(db.webhookDelivery.update).toHaveBeenCalledWith({
				where: { id: "delivery_123" },
				data: {
					attempts: 1,
					statusCode: 200,
					response: "Response body",
					deliveredAt: expect.any(Date),
				},
			});
		});

		it("updates delivery record on failed delivery", async () => {
			vi.mocked(db.webhook.findMany).mockResolvedValue([
				{
					id: "webhook_1",
					url: "https://example.com/hook",
					secret: "secret_1",
					enabled: true,
					events: ["user.created"],
				},
			] as never);

			vi.mocked(db.webhookDelivery.create).mockResolvedValue({
				id: "delivery_123",
			} as never);

			mockFetch.mockResolvedValue({
				ok: false,
				status: 500,
				text: () => Promise.resolve("Server Error"),
			});

			const resultsPromise = dispatchWebhooks({
				organizationId: "org_123",
				event: "user.created",
				data: {},
			});

			await vi.runAllTimersAsync();
			await resultsPromise;

			// Check the last update call (after all retries)
			const updateCalls = vi.mocked(db.webhookDelivery.update).mock.calls;
			const lastCall = updateCalls[updateCalls.length - 1];
			expect(lastCall?.[0]?.data).toMatchObject({
				attempts: 4, // Initial + 3 retries
				statusCode: 500,
				deliveredAt: null,
			});
		});

		it("updates delivery record with error message on network failure", async () => {
			vi.mocked(db.webhook.findMany).mockResolvedValue([
				{
					id: "webhook_1",
					url: "https://example.com/hook",
					secret: "secret_1",
					enabled: true,
					events: ["user.created"],
				},
			] as never);

			vi.mocked(db.webhookDelivery.create).mockResolvedValue({
				id: "delivery_123",
			} as never);

			mockFetch.mockRejectedValue(new Error("Network timeout"));

			const resultsPromise = dispatchWebhooks({
				organizationId: "org_123",
				event: "user.created",
				data: {},
			});

			await vi.runAllTimersAsync();
			await resultsPromise;

			expect(db.webhookDelivery.update).toHaveBeenCalledWith({
				where: { id: "delivery_123" },
				data: {
					attempts: expect.any(Number),
					response: "Network timeout",
				},
			});
		});
	});
});

describe("retryWebhookDelivery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("throws error when delivery not found", async () => {
		vi.mocked(db.webhookDelivery.findUnique).mockResolvedValue(null);

		await expect(retryWebhookDelivery("nonexistent")).rejects.toThrow(
			"Delivery not found",
		);
	});

	it("throws error when delivery already succeeded", async () => {
		vi.mocked(db.webhookDelivery.findUnique).mockResolvedValue({
			id: "delivery_123",
			deliveredAt: new Date(),
			payload: {},
			webhook: {
				id: "webhook_1",
				url: "https://example.com",
				secret: "secret",
			},
		} as never);

		await expect(retryWebhookDelivery("delivery_123")).rejects.toThrow(
			"Delivery already succeeded",
		);
	});

	it("retries failed delivery", async () => {
		vi.mocked(db.webhookDelivery.findUnique).mockResolvedValue({
			id: "delivery_123",
			deliveredAt: null,
			payload: { event: "user.created", data: {} },
			webhook: {
				id: "webhook_1",
				url: "https://example.com/hook",
				secret: "secret_123",
			},
		} as never);

		vi.mocked(db.webhookDelivery.create).mockResolvedValue({
			id: "new_delivery_123",
		} as never);

		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			text: () => Promise.resolve("OK"),
		});

		const resultPromise = retryWebhookDelivery("delivery_123");

		await vi.runAllTimersAsync();
		const result = await resultPromise;

		expect(result).toEqual({
			webhookId: "webhook_1",
			success: true,
			statusCode: 200,
		});

		expect(mockFetch).toHaveBeenCalledWith(
			"https://example.com/hook",
			expect.objectContaining({
				method: "POST",
				body: expect.stringContaining("user.created"),
			}),
		);
	});
});
