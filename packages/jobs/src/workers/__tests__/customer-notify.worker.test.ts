import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findUnique: vi.fn(),
	update: vi.fn(),
	billingMonth: vi.fn(),
	payments: vi.fn(),
}));

vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@repo/database", async () => ({
	...(await import("../../../../database/lib/settlement")),
	db: {
		customerNotification: {
			findUnique: mocks.findUnique,
			update: mocks.update,
		},
		billingMonth: { findUnique: mocks.billingMonth },
		payment: { findMany: mocks.payments },
	},
}));

vi.mock("@repo/sms", () => ({ sendSms: vi.fn() }));

vi.mock("../../lib/wpbox", () => ({
	sendWhatsAppExpiryReminder: vi.fn(),
	sendWhatsAppStopNotice: vi.fn(),
}));

vi.mock("bullmq", () => ({ Worker: class MockWorker {} }));
vi.mock("../../connection", () => ({
	getRedisConnection: vi.fn(() => ({})),
}));

import { sendSms } from "@repo/sms";
import {
	sendWhatsAppExpiryReminder,
	sendWhatsAppStopNotice,
} from "../../lib/wpbox";
import { processCustomerNotification } from "../customer-notify.worker";

const firstAttempt = { attemptsMade: 0, opts: { attempts: 4 } };
const lastAttempt = { attemptsMade: 3, opts: { attempts: 4 } };

function reminderRow(overrides: Record<string, unknown> = {}) {
	return {
		id: "n1",
		kind: "expiry_reminder",
		channel: "whatsapp",
		phone: "96170111222",
		body: JSON.stringify(["(1/10/2026)", "76 878 870"]),
		contactPhone: "76 878 870",
		status: "queued",
		invoice: {
			organizationId: "org-1",
			customerId: "c1",
			year: 2026,
			month: 9,
			total: 30,
			totalWithTax: 0,
			voidedAt: null,
		},
		payment: null,
		...overrides,
	};
}

function lastUpdate() {
	const calls = mocks.update.mock.calls;
	return calls[calls.length - 1]?.[0].data;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.billingMonth.mockResolvedValue({ id: "bm-sep" });
	mocks.payments.mockResolvedValue([]);
	mocks.update.mockResolvedValue({});
});

describe("processCustomerNotification", () => {
	it("sends the WhatsApp reminder with the stored params and marks it sent", async () => {
		mocks.findUnique.mockResolvedValue(reminderRow());
		vi.mocked(sendWhatsAppExpiryReminder).mockResolvedValue({
			ok: true,
			phone: "96170111222",
			status: 200,
			messageId: "m1",
		});

		await expect(
			processCustomerNotification("n1", firstAttempt),
		).resolves.toEqual({ status: "sent" });
		expect(sendWhatsAppExpiryReminder).toHaveBeenCalledWith({
			phone: "96170111222",
			expiryLabel: "(1/10/2026)",
			contactPhone: "76 878 870",
			notificationId: "n1",
		});
		expect(lastUpdate()).toMatchObject({
			status: "sent",
			attempts: 1,
			providerMessageId: "m1",
		});
	});

	it("skips a reminder whose invoice got paid between claim and send", async () => {
		mocks.findUnique.mockResolvedValue(reminderRow());
		mocks.payments.mockResolvedValue([
			{
				customerId: "c1",
				billingMonthId: "bm-sep",
				paidAmount: 30,
				discount: 0,
				freeAccount: false,
				paidAt: new Date("2026-09-30T08:00:00Z"),
			},
		]);

		await expect(
			processCustomerNotification("n1", firstAttempt),
		).resolves.toEqual({ status: "skipped" });
		expect(sendWhatsAppExpiryReminder).not.toHaveBeenCalled();
		expect(lastUpdate()).toEqual({
			status: "skipped",
			error: "paid before send",
		});
	});

	it("skips a stop notice once the stop was reviewed", async () => {
		mocks.findUnique.mockResolvedValue(
			reminderRow({
				kind: "stop_notice",
				body: JSON.stringify(["76 878 870"]),
				invoice: null,
				payment: { reviewedAt: new Date() },
			}),
		);

		await expect(
			processCustomerNotification("n1", firstAttempt),
		).resolves.toEqual({ status: "skipped" });
		expect(sendWhatsAppStopNotice).not.toHaveBeenCalled();
		expect(lastUpdate()).toMatchObject({ error: "already reviewed" });
	});

	it("sends a pending stop notice", async () => {
		mocks.findUnique.mockResolvedValue(
			reminderRow({
				kind: "stop_notice",
				body: JSON.stringify(["76 878 870"]),
				invoice: null,
				payment: { reviewedAt: null },
			}),
		);
		vi.mocked(sendWhatsAppStopNotice).mockResolvedValue({
			ok: true,
			phone: "96170111222",
			status: 200,
			messageId: null,
		});

		await expect(
			processCustomerNotification("n1", firstAttempt),
		).resolves.toEqual({ status: "sent" });
		expect(sendWhatsAppStopNotice).toHaveBeenCalledWith({
			phone: "96170111222",
			contactPhone: "76 878 870",
			notificationId: "n1",
		});
	});

	it("does nothing for a row that is no longer queued", async () => {
		mocks.findUnique.mockResolvedValue(reminderRow({ status: "sent" }));

		await expect(
			processCustomerNotification("n1", firstAttempt),
		).resolves.toEqual({ status: "skipped" });
		expect(sendWhatsAppExpiryReminder).not.toHaveBeenCalled();
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("marks a permanent SMS failure failed without retrying", async () => {
		mocks.findUnique.mockResolvedValue(
			reminderRow({ channel: "sms", body: "Libancom: ..." }),
		);
		vi.mocked(sendSms).mockResolvedValue({
			success: false,
			raw: "ERR: No credit",
			error: "No credit",
			retriable: false,
		});

		await expect(
			processCustomerNotification("n1", firstAttempt),
		).resolves.toEqual({ status: "failed" });
		expect(sendSms).toHaveBeenCalledWith({
			to: "96170111222",
			body: "Libancom: ...",
		});
		expect(lastUpdate()).toMatchObject({
			status: "failed",
			error: "No credit",
		});
	});

	it("throws on a retriable failure and keeps the row queued", async () => {
		mocks.findUnique.mockResolvedValue(reminderRow());
		vi.mocked(sendWhatsAppExpiryReminder).mockResolvedValue({
			ok: false,
			phone: "96170111222",
			status: 503,
			error: "API returned 503",
			retriable: true,
		});

		await expect(
			processCustomerNotification("n1", firstAttempt),
		).rejects.toThrow("Customer notify retry");
		expect(lastUpdate()).not.toHaveProperty("status");
	});

	it("writes failed on the last retriable attempt instead of throwing", async () => {
		mocks.findUnique.mockResolvedValue(reminderRow());
		vi.mocked(sendWhatsAppExpiryReminder).mockResolvedValue({
			ok: false,
			phone: "96170111222",
			status: 503,
			error: "API returned 503",
			retriable: true,
		});

		await expect(
			processCustomerNotification("n1", lastAttempt),
		).resolves.toEqual({ status: "failed" });
		expect(lastUpdate()).toMatchObject({
			status: "failed",
			attempts: 4,
			error: "503: API returned 503 after 4 attempts",
		});
	});

	it("does not fail (and send again) when the success log write throws", async () => {
		mocks.findUnique.mockResolvedValue(reminderRow());
		vi.mocked(sendWhatsAppExpiryReminder).mockResolvedValue({
			ok: true,
			phone: "96170111222",
			status: 200,
			messageId: null,
		});
		mocks.update.mockRejectedValue(new Error("connection reset"));

		await expect(
			processCustomerNotification("n1", firstAttempt),
		).resolves.toEqual({ status: "sent" });
		expect(sendWhatsAppExpiryReminder).toHaveBeenCalledTimes(1);
	});
});
