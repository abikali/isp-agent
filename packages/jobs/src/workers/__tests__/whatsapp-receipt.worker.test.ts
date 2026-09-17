import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@repo/database", () => ({
	appendPaymentActivityLog: vi.fn(),
	getPrimaryPhone: vi.fn(() => "96170000000"),
	db: { payment: { findUnique: vi.fn() } },
}));

vi.mock("../../lib/wpbox", () => ({
	sendWhatsAppReceipt: vi.fn(),
	sendWhatsAppReferralReward: vi.fn(),
}));

let capturedProcessor:
	| ((job: {
			data: unknown;
			attemptsMade: number;
			opts: { attempts?: number };
	  }) => Promise<unknown>)
	| null = null;

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

import { appendPaymentActivityLog, db } from "@repo/database";
import {
	sendWhatsAppReceipt,
	sendWhatsAppReferralReward,
} from "../../lib/wpbox";
import { createWhatsAppReceiptWorker } from "../whatsapp-receipt.worker";
import { processReferralRewardJob } from "../whatsapp-referral-reward";

const job = { attemptsMade: 0, opts: { attempts: 8 } };

describe("WhatsApp receipt worker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createWhatsAppReceiptWorker();
	});

	it("does not fail (and retry the send) when the success log write throws", async () => {
		vi.mocked(sendWhatsAppReceipt).mockResolvedValue({
			ok: true,
			phone: "96170000000",
			status: 200,
			messageId: null,
		});
		vi.mocked(appendPaymentActivityLog).mockRejectedValue(
			new Error("connection reset"),
		);

		await expect(
			capturedProcessor?.({
				...job,
				data: { phone: "70000000", paymentId: "pay_1" },
			}),
		).resolves.toEqual({ success: true });
		expect(sendWhatsAppReceipt).toHaveBeenCalledTimes(1);
	});

	it("still throws on a retriable send failure", async () => {
		vi.mocked(sendWhatsAppReceipt).mockResolvedValue({
			ok: false,
			phone: "96170000000",
			status: 503,
			error: "API returned 503",
			retriable: true,
		});

		await expect(
			capturedProcessor?.({
				...job,
				data: { phone: "70000000", paymentId: "pay_1" },
			}),
		).rejects.toThrow("WPBox retry");
		expect(appendPaymentActivityLog).not.toHaveBeenCalled();
	});
});

describe("processReferralRewardJob", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("does not fail (and message again) when the success log write throws", async () => {
		vi.mocked(db.payment.findUnique).mockResolvedValue({
			freeAccount: true,
			stoppedAccount: false,
			reviewedAt: new Date(),
			referralRewardNotifiedAt: new Date(),
			billingMonth: { year: 2026, month: 9 },
			customer: {
				firstName: "Georges",
				lastName: null,
				username: "georges",
				phones: [],
				mobile: null,
				phone: null,
			},
			referredCustomer: {
				firstName: "Jad",
				lastName: "Asmar",
				username: "jadasmar",
			},
		} as never);
		vi.mocked(sendWhatsAppReferralReward).mockResolvedValue({
			ok: true,
			phone: "96170000000",
			status: 200,
			messageId: null,
		});
		vi.mocked(appendPaymentActivityLog).mockRejectedValue(
			new Error("connection reset"),
		);

		await expect(
			processReferralRewardJob(
				{ kind: "referral-reward", paymentId: "pay_1" },
				job as never,
			),
		).resolves.toEqual({ success: true });
		expect(sendWhatsAppReferralReward).toHaveBeenCalledTimes(1);
	});
});
