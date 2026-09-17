import { beforeEach, describe, expect, it, vi } from "vitest";

const { update } = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@repo/database", () => ({
	db: { ispDealerAccount: { update } },
}));

vi.mock("../../lib/wpbox", () => ({
	sendWhatsAppDealerAccountUpdate: vi.fn(),
}));

interface TestJob {
	data: {
		kind: "dealer_account_update";
		dealerAccountId: string;
		phone: string;
		params: string[];
	};
	attemptsMade: number;
	opts: { attempts?: number };
}

let capturedProcessor: ((job: TestJob) => Promise<unknown>) | null = null;

vi.mock("bullmq", () => ({
	Worker: class MockWorker {
		constructor(_name: string, processor: unknown) {
			capturedProcessor = processor as typeof capturedProcessor;
		}
	},
}));

vi.mock("../../connection", () => ({
	getRedisConnection: vi.fn(() => ({})),
}));

vi.mock("../../queues/whatsapp-template.queue", () => ({
	WHATSAPP_TEMPLATE_QUEUE_NAME: "whatsapp-template",
}));

import { sendWhatsAppDealerAccountUpdate } from "../../lib/wpbox";
import { createWhatsAppTemplateWorker } from "../whatsapp-template.worker";

const params = ["Khashan", "إضافة رصيد", "$1.00", "2026-09-17", "$1.00"];

function makeJob(attemptsMade: number, attempts = 3): TestJob {
	return {
		data: {
			kind: "dealer_account_update",
			dealerAccountId: "acc_1",
			phone: "96170123456",
			params,
		},
		attemptsMade,
		opts: { attempts },
	};
}

function savedNotice(): Record<string, unknown> {
	const call = update.mock.lastCall?.[0] as {
		where: { id: string };
		data: { whatsappNotice: Record<string, unknown> };
	};
	expect(call.where).toEqual({ id: "acc_1" });
	return call.data.whatsappNotice;
}

describe("createWhatsAppTemplateWorker", () => {
	let processJob: (job: TestJob) => Promise<unknown>;

	beforeEach(() => {
		vi.clearAllMocks();
		capturedProcessor = null;
		createWhatsAppTemplateWorker();
		if (!capturedProcessor) {
			throw new Error("Worker processor was not captured");
		}
		processJob = capturedProcessor;
	});

	it("stores sent with the message id on success", async () => {
		vi.mocked(sendWhatsAppDealerAccountUpdate).mockResolvedValue({
			ok: true,
			phone: "96170123456",
			status: 200,
			messageId: "wamid.1",
		});

		await expect(processJob(makeJob(1))).resolves.toEqual({
			success: true,
		});
		expect(savedNotice()).toMatchObject({
			status: "sent",
			phone: "96170123456",
			params,
			error: null,
			messageId: "wamid.1",
		});
	});

	it("throws to let BullMQ retry while attempts remain, without writing", async () => {
		vi.mocked(sendWhatsAppDealerAccountUpdate).mockResolvedValue({
			ok: false,
			phone: "96170123456",
			status: 503,
			error: "HTTP 503",
			retriable: true,
		});

		await expect(processJob(makeJob(0))).rejects.toThrow("WPBox retry");
		await expect(processJob(makeJob(1))).rejects.toThrow("WPBox retry");
		expect(update).not.toHaveBeenCalled();
	});

	it("writes failed back on the last attempt of a transient error", async () => {
		vi.mocked(sendWhatsAppDealerAccountUpdate).mockResolvedValue({
			ok: false,
			phone: "96170123456",
			status: 503,
			error: "HTTP 503",
			retriable: true,
		});

		await expect(processJob(makeJob(2))).resolves.toEqual({
			success: false,
		});
		expect(savedNotice()).toMatchObject({
			status: "failed",
			error: "HTTP 503 after 3 retries",
			messageId: null,
		});
	});

	it("writes failed immediately for a permanent error", async () => {
		vi.mocked(sendWhatsAppDealerAccountUpdate).mockResolvedValue({
			ok: false,
			phone: "96170123456",
			status: 200,
			error: "Invalid template",
			retriable: false,
		});

		await expect(processJob(makeJob(0))).resolves.toEqual({
			success: false,
		});
		expect(savedNotice()).toMatchObject({
			status: "failed",
			error: "Invalid template",
		});
	});
});
