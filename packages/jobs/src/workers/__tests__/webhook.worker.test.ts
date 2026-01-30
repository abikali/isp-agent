import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("@repo/database", () => ({
	db: {
		webhookDelivery: {
			update: vi.fn(),
		},
	},
}));

let capturedProcessor:
	| ((job: {
			id: string;
			data: unknown;
			attemptsMade: number;
	  }) => Promise<unknown>)
	| null = null;

let workerConstructorCalls: Array<{
	name: string;
	processor: unknown;
	options: unknown;
}> = [];

vi.mock("bullmq", () => {
	return {
		Worker: class MockWorker {
			constructor(name: string, processor: unknown, options: unknown) {
				capturedProcessor = processor as typeof capturedProcessor;
				workerConstructorCalls.push({ name, processor, options });
			}
		},
	};
});

vi.mock("../../connection", () => ({
	getRedisConnection: vi.fn(() => ({})),
}));

vi.mock("../../queues/webhook.queue", () => ({
	WEBHOOK_QUEUE_NAME: "webhook",
}));

// Import after mocking
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { createWebhookWorker } from "../webhook.worker";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("createWebhookWorker", () => {
	let workerProcessor: (job: {
		id: string;
		data: unknown;
		attemptsMade: number;
	}) => Promise<unknown>;

	const validJobData = {
		webhookId: "webhook_123",
		deliveryId: "delivery_456",
		url: "https://example.com/webhook",
		secret: "test_secret_key",
		payload: JSON.stringify({ event: "test.event", data: { foo: "bar" } }),
		event: "test.event",
		organizationId: "org_789",
	};

	beforeEach(() => {
		vi.clearAllMocks();
		capturedProcessor = null;
		workerConstructorCalls = [];
		createWebhookWorker();
		if (!capturedProcessor) {
			throw new Error("Worker processor was not captured during setup");
		}
		workerProcessor = capturedProcessor;
	});

	describe("successful delivery", () => {
		it("delivers webhook and updates database on success", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				text: () => Promise.resolve("OK"),
			});

			const job = {
				id: "job_123",
				data: validJobData,
				attemptsMade: 0,
			};

			const result = await workerProcessor(job);

			expect(result).toEqual({
				success: true,
				statusCode: 200,
				response: "OK",
			});

			// Verify fetch was called with correct signature
			expect(mockFetch).toHaveBeenCalledWith(
				"https://example.com/webhook",
				expect.objectContaining({
					method: "POST",
					headers: expect.objectContaining({
						"Content-Type": "application/json",
						"X-Webhook-Id": "delivery_456",
					}),
					body: validJobData.payload,
				}),
			);

			// Verify signature is correct
			const fetchCall = mockFetch.mock.calls[0];
			const headers = fetchCall?.[1]?.headers as Record<string, string>;
			const expectedSignature = createHmac("sha256", validJobData.secret)
				.update(validJobData.payload)
				.digest("hex");
			expect(headers["X-Webhook-Signature"]).toBe(expectedSignature);

			// Verify database update
			expect(db.webhookDelivery.update).toHaveBeenCalledWith({
				where: { id: "delivery_456" },
				data: {
					attempts: 1,
					statusCode: 200,
					response: "OK",
					deliveredAt: expect.any(Date),
				},
			});

			// Verify logging
			expect(logger.info).toHaveBeenCalledWith(
				"Webhook delivered successfully",
				expect.objectContaining({
					deliveryId: "delivery_456",
					statusCode: 200,
				}),
			);
		});

		it("increments attempt count correctly", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				text: () => Promise.resolve("OK"),
			});

			const job = {
				id: "job_123",
				data: validJobData,
				attemptsMade: 2, // Third attempt
			};

			await workerProcessor(job);

			expect(db.webhookDelivery.update).toHaveBeenCalledWith({
				where: { id: "delivery_456" },
				data: expect.objectContaining({
					attempts: 3,
				}),
			});
		});
	});

	describe("failed delivery", () => {
		it("throws error and updates database on non-ok response", async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				status: 500,
				text: () => Promise.resolve("Internal Server Error"),
			});

			const job = {
				id: "job_124",
				data: validJobData,
				attemptsMade: 0,
			};

			await expect(workerProcessor(job)).rejects.toThrow(
				"Webhook failed with status 500",
			);

			// Verify database update without deliveredAt
			expect(db.webhookDelivery.update).toHaveBeenCalledWith({
				where: { id: "delivery_456" },
				data: {
					attempts: 1,
					statusCode: 500,
					response: "Internal Server Error",
					deliveredAt: null,
				},
			});
		});

		it("handles 4xx client errors", async () => {
			mockFetch.mockResolvedValue({
				ok: false,
				status: 404,
				text: () => Promise.resolve("Not Found"),
			});

			const job = {
				id: "job_125",
				data: validJobData,
				attemptsMade: 0,
			};

			await expect(workerProcessor(job)).rejects.toThrow(
				"Webhook failed with status 404",
			);
		});
	});

	describe("network errors", () => {
		it("handles network timeout", async () => {
			const timeoutError = new Error("Timeout");
			timeoutError.name = "AbortError";
			mockFetch.mockRejectedValue(timeoutError);

			const job = {
				id: "job_126",
				data: validJobData,
				attemptsMade: 0,
			};

			await expect(workerProcessor(job)).rejects.toThrow("Timeout");

			// Verify error is logged
			expect(logger.error).toHaveBeenCalledWith(
				expect.stringContaining("Webhook job job_126 failed"),
				expect.objectContaining({
					deliveryId: "delivery_456",
				}),
			);

			// Verify database update with error message
			expect(db.webhookDelivery.update).toHaveBeenCalledWith({
				where: { id: "delivery_456" },
				data: {
					attempts: 1,
					response: "Timeout",
				},
			});
		});

		it("handles connection refused", async () => {
			mockFetch.mockRejectedValue(new Error("Connection refused"));

			const job = {
				id: "job_127",
				data: validJobData,
				attemptsMade: 1,
			};

			await expect(workerProcessor(job)).rejects.toThrow(
				"Connection refused",
			);

			expect(db.webhookDelivery.update).toHaveBeenCalledWith({
				where: { id: "delivery_456" },
				data: {
					attempts: 2,
					response: "Connection refused",
				},
			});
		});
	});

	describe("response handling", () => {
		it("truncates long response text to 1000 characters", async () => {
			const longResponse = "A".repeat(2000);
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				text: () => Promise.resolve(longResponse),
			});

			const job = {
				id: "job_128",
				data: validJobData,
				attemptsMade: 0,
			};

			await workerProcessor(job);

			expect(db.webhookDelivery.update).toHaveBeenCalledWith({
				where: { id: "delivery_456" },
				data: expect.objectContaining({
					response: "A".repeat(1000),
				}),
			});
		});

		it("handles empty response text", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 204,
				text: () => Promise.resolve(""),
			});

			const job = {
				id: "job_129",
				data: validJobData,
				attemptsMade: 0,
			};

			const result = await workerProcessor(job);

			expect(result).toEqual({
				success: true,
				statusCode: 204,
				response: "",
			});
		});

		it("handles text() rejection gracefully", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				text: () => Promise.reject(new Error("Body already consumed")),
			});

			const job = {
				id: "job_130",
				data: validJobData,
				attemptsMade: 0,
			};

			const result = await workerProcessor(job);

			expect(result).toEqual({
				success: true,
				statusCode: 200,
				response: "",
			});
		});
	});

	describe("signature generation", () => {
		it("generates correct HMAC-SHA256 signature", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				text: () => Promise.resolve("OK"),
			});

			const customPayload = JSON.stringify({ test: "data" });
			const customSecret = "my_webhook_secret_123";

			const job = {
				id: "job_131",
				data: {
					...validJobData,
					payload: customPayload,
					secret: customSecret,
				},
				attemptsMade: 0,
			};

			await workerProcessor(job);

			const fetchCall = mockFetch.mock.calls[0];
			const headers = fetchCall?.[1]?.headers as Record<string, string>;
			const expectedSignature = createHmac("sha256", customSecret)
				.update(customPayload)
				.digest("hex");

			expect(headers["X-Webhook-Signature"]).toBe(expectedSignature);
		});
	});

	describe("worker configuration", () => {
		it("creates worker with correct queue name and options", () => {
			expect(workerConstructorCalls).toHaveLength(1);
			expect(workerConstructorCalls[0]?.name).toBe("webhook");
			expect(typeof workerConstructorCalls[0]?.processor).toBe(
				"function",
			);
			expect(workerConstructorCalls[0]?.options).toMatchObject({
				concurrency: 10,
			});
		});

		it("sets 30 second timeout on fetch", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				text: () => Promise.resolve("OK"),
			});

			const job = {
				id: "job_132",
				data: validJobData,
				attemptsMade: 0,
			};

			await workerProcessor(job);

			expect(mockFetch).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					signal: expect.any(AbortSignal),
				}),
			);
		});
	});

	describe("logging", () => {
		it("logs processing start with webhook details", async () => {
			mockFetch.mockResolvedValue({
				ok: true,
				status: 200,
				text: () => Promise.resolve("OK"),
			});

			const job = {
				id: "job_133",
				data: validJobData,
				attemptsMade: 0,
			};

			await workerProcessor(job);

			expect(logger.info).toHaveBeenCalledWith(
				"Processing webhook job job_133",
				expect.objectContaining({
					webhookId: "webhook_123",
					event: "test.event",
					url: "https://example.com/webhook",
				}),
			);
		});
	});
});
