import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies
vi.mock("@repo/logs", () => ({
	logger: {
		info: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("@repo/mail", () => ({
	sendEmail: vi.fn(),
}));

let capturedProcessor:
	| ((job: { id: string; data: unknown }) => Promise<unknown>)
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

vi.mock("../../queues/email.queue", () => ({
	EMAIL_QUEUE_NAME: "email",
}));

// Import after mocking
import { logger } from "@repo/logs";
import { sendEmail } from "@repo/mail";
import { createEmailWorker } from "../email.worker";

describe("createEmailWorker", () => {
	let workerProcessor: (job: {
		id: string;
		data: unknown;
	}) => Promise<unknown>;

	beforeEach(() => {
		vi.clearAllMocks();
		capturedProcessor = null;
		workerConstructorCalls = [];
		createEmailWorker();
		if (!capturedProcessor) {
			throw new Error("Worker processor was not captured during setup");
		}
		workerProcessor = capturedProcessor;
	});

	describe("template emails", () => {
		it("sends template email successfully", async () => {
			vi.mocked(sendEmail).mockResolvedValue(true);

			const job = {
				id: "job_123",
				data: {
					to: "test@example.com",
					locale: "en",
					templateId: "welcome",
					context: { name: "John" },
				},
			};

			const result = await workerProcessor(job);

			expect(result).toEqual({ success: true });
			expect(sendEmail).toHaveBeenCalledWith({
				to: "test@example.com",
				locale: "en",
				templateId: "welcome",
				context: { name: "John" },
			});
			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining("Processing email job"),
				expect.objectContaining({
					to: "test@example.com",
					templateId: "welcome",
				}),
			);
			expect(logger.info).toHaveBeenCalledWith(
				expect.stringContaining("completed successfully"),
				expect.objectContaining({ to: "test@example.com" }),
			);
		});

		it("throws error when template email fails", async () => {
			vi.mocked(sendEmail).mockResolvedValue(false);

			const job = {
				id: "job_124",
				data: {
					to: "test@example.com",
					templateId: "welcome",
					context: {},
				},
			};

			await expect(workerProcessor(job)).rejects.toThrow(
				"Email sending failed",
			);
			expect(logger.error).toHaveBeenCalled();
		});
	});

	describe("simple emails", () => {
		it("sends simple email with subject and text", async () => {
			vi.mocked(sendEmail).mockResolvedValue(true);

			const job = {
				id: "job_125",
				data: {
					to: "test@example.com",
					subject: "Hello",
					text: "Plain text body",
				},
			};

			const result = await workerProcessor(job);

			expect(result).toEqual({ success: true });
			expect(sendEmail).toHaveBeenCalledWith({
				to: "test@example.com",
				subject: "Hello",
				text: "Plain text body",
			});
		});

		it("sends simple email with subject and html", async () => {
			vi.mocked(sendEmail).mockResolvedValue(true);

			const job = {
				id: "job_126",
				data: {
					to: "test@example.com",
					subject: "Hello",
					html: "<h1>HTML body</h1>",
				},
			};

			const result = await workerProcessor(job);

			expect(result).toEqual({ success: true });
			expect(sendEmail).toHaveBeenCalledWith({
				to: "test@example.com",
				subject: "Hello",
				html: "<h1>HTML body</h1>",
			});
		});

		it("includes locale when provided for simple email", async () => {
			vi.mocked(sendEmail).mockResolvedValue(true);

			const job = {
				id: "job_127",
				data: {
					to: "test@example.com",
					subject: "Hola",
					text: "Spanish content",
					locale: "es",
				},
			};

			const result = await workerProcessor(job);

			expect(result).toEqual({ success: true });
			expect(sendEmail).toHaveBeenCalledWith({
				to: "test@example.com",
				subject: "Hola",
				text: "Spanish content",
				locale: "es",
			});
		});

		it("sends simple email with both text and html", async () => {
			vi.mocked(sendEmail).mockResolvedValue(true);

			const job = {
				id: "job_128",
				data: {
					to: "test@example.com",
					subject: "Hello",
					text: "Plain text",
					html: "<p>HTML</p>",
				},
			};

			const result = await workerProcessor(job);

			expect(result).toEqual({ success: true });
			expect(sendEmail).toHaveBeenCalledWith({
				to: "test@example.com",
				subject: "Hello",
				text: "Plain text",
				html: "<p>HTML</p>",
			});
		});
	});

	describe("validation", () => {
		it("throws error when neither templateId nor subject is provided", async () => {
			const job = {
				id: "job_129",
				data: {
					to: "test@example.com",
				},
			};

			await expect(workerProcessor(job)).rejects.toThrow(
				"Invalid email job data: missing templateId or subject",
			);
			expect(sendEmail).not.toHaveBeenCalled();
			expect(logger.error).toHaveBeenCalled();
		});
	});

	describe("error handling", () => {
		it("logs and rethrows when sendEmail throws", async () => {
			const error = new Error("SMTP connection failed");
			vi.mocked(sendEmail).mockRejectedValue(error);

			const job = {
				id: "job_130",
				data: {
					to: "test@example.com",
					templateId: "welcome",
					context: {},
				},
			};

			await expect(workerProcessor(job)).rejects.toThrow(
				"SMTP connection failed",
			);
			expect(logger.error).toHaveBeenCalledWith(
				expect.stringContaining("Email job job_130 failed"),
				expect.objectContaining({
					error,
					to: "test@example.com",
				}),
			);
		});
	});

	describe("worker configuration", () => {
		it("creates worker with correct queue name and options", () => {
			expect(workerConstructorCalls).toHaveLength(1);
			expect(workerConstructorCalls[0]?.name).toBe("email");
			expect(typeof workerConstructorCalls[0]?.processor).toBe(
				"function",
			);
			expect(workerConstructorCalls[0]?.options).toMatchObject({
				concurrency: 5,
			});
		});
	});
});
