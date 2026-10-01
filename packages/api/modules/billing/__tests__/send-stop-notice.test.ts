import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	notificationGroupBy: vi.fn(async () => [] as unknown[]),
	requirePermission: vi.fn(),
	orgFind: vi.fn(),
	paymentFind: vi.fn(),
	paymentUpdate: vi.fn(),
	suppressionCount: vi.fn(),
	createManyAndReturn: vi.fn(),
	appendLog: vi.fn(),
	queue: vi.fn(),
}));

vi.mock("@repo/api/lib/permission", () => ({
	requirePermission: mocks.requirePermission,
	getDealerScopeViaCustomer: (activeDealerId: string | null) => ({
		customer: { dealerId: activeDealerId },
	}),
}));

vi.mock("@repo/database", async () => {
	const phones = await import("../../../../database/lib/phones");
	const tx = {
		payment: { update: mocks.paymentUpdate },
		customerNotification: {
			createManyAndReturn: mocks.createManyAndReturn,
		},
	};
	return {
		...phones,
		appendPaymentActivityLog: mocks.appendLog,
		db: {
			organization: { findUnique: mocks.orgFind },
			payment: { findFirst: mocks.paymentFind },
			marketingSuppression: { count: mocks.suppressionCount },
			customerNotification: { groupBy: mocks.notificationGroupBy },
			$transaction: (fn: (client: typeof tx) => Promise<unknown>) =>
				fn(tx),
		},
	};
});

// Real row building / contact-phone logic, mocked queue.
vi.mock("@repo/jobs", async () => ({
	...(await import("../../../../jobs/src/lib/customer-notifications")),
	queueCustomerNotifications: mocks.queue,
}));

import { sendStopNotice } from "../procedures/send-stop-notice";

const ORG = {
	isWholesaleOperator: true,
	expiryReminderAllowed: false,
	expiryReminderWhatsapp: true,
	expiryReminderSms: true,
	stopNoticeSmsLimit: null,
	stopNoticeWhatsappLimit: null,
	reminderFallbackPhone: null,
	activeDealer: { whatsappPhone: null, companyMobile: null },
};

function pendingStop(overrides: Record<string, unknown> = {}) {
	return {
		id: "pay-1",
		customerId: "cust-1",
		stoppedAccount: true,
		reviewedAt: null,
		stopNoticeSentAt: null,
		collector: { phone: "+96176878870" },
		customer: {
			phones: [{ number: "+96170111222", primary: true }],
			mobile: null,
			phone: null,
			collectorPhone: null,
			collector: { phone: "+96103775126" },
		},
		...overrides,
	};
}

async function call(input: Record<string, unknown> = {}) {
	const handler = (
		sendStopNotice as unknown as {
			"~orpc": { handler: (args: unknown) => Promise<unknown> };
		}
	)["~orpc"].handler;
	return handler({
		context: { user: { id: "admin-1" } },
		input: {
			organizationId: "org-1",
			paymentId: "pay-1",
			channels: ["whatsapp", "sms"],
			dryRun: false,
			...input,
		},
	}) as Promise<Record<string, unknown>>;
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.requirePermission.mockResolvedValue({ activeDealerId: "dealer-1" });
	mocks.orgFind.mockResolvedValue(ORG);
	mocks.notificationGroupBy.mockResolvedValue([]);
	mocks.paymentFind.mockResolvedValue(pendingStop());
	mocks.suppressionCount.mockResolvedValue(0);
	mocks.createManyAndReturn.mockImplementation(
		async ({ data }: { data: Array<Record<string, unknown>> }) =>
			data.map((row, i) => ({
				id: `n${i + 1}`,
				channel: row["channel"],
				status: row["status"],
				error: row["error"],
			})),
	);
});

describe("sendStopNotice", () => {
	it("needs billing:manage and scopes the payment to the dealer", async () => {
		await call();
		expect(mocks.requirePermission).toHaveBeenCalledWith(
			"org-1",
			"admin-1",
			"billing",
			"manage",
		);
		expect(mocks.paymentFind.mock.calls[0]?.[0].where).toEqual({
			id: "pay-1",
			organizationId: "org-1",
			customer: { dealerId: "dealer-1" },
		});
	});

	it("rejects a payment that is not a pending stop", async () => {
		mocks.paymentFind.mockResolvedValue(
			pendingStop({ reviewedAt: new Date() }),
		);
		await expect(call()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Not a pending stop",
		});

		mocks.paymentFind.mockResolvedValue(
			pendingStop({ stoppedAccount: false }),
		);
		await expect(call()).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(mocks.createManyAndReturn).not.toHaveBeenCalled();
	});

	it("is refused for a dealer org the operator has not granted", async () => {
		mocks.orgFind.mockResolvedValue({ ...ORG, isWholesaleOperator: false });
		await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	it("enforces a 10-minute cooldown", async () => {
		mocks.paymentFind.mockResolvedValue(
			pendingStop({ stopNoticeSentAt: new Date(Date.now() - 60_000) }),
		);
		await expect(call()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
		});

		mocks.paymentFind.mockResolvedValue(
			pendingStop({
				stopNoticeSentAt: new Date(Date.now() - 11 * 60_000),
			}),
		);
		await expect(call()).resolves.toMatchObject({ dryRun: false });
	});

	it("rejects a customer without a phone", async () => {
		mocks.paymentFind.mockResolvedValue(
			pendingStop({
				customer: {
					phones: [],
					mobile: null,
					phone: null,
					collectorPhone: null,
					collector: null,
				},
			}),
		);
		await expect(call()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "Customer has no phone",
		});
	});

	it("uses the stop's collector first, then falls back down to the office phone", async () => {
		await expect(call({ dryRun: true })).resolves.toMatchObject({
			contactPhone: "76878870",
		});

		mocks.paymentFind.mockResolvedValue(
			pendingStop({ collector: { phone: null } }),
		);
		await expect(call({ dryRun: true })).resolves.toMatchObject({
			contactPhone: "03775126",
		});

		mocks.paymentFind.mockResolvedValue(
			pendingStop({
				collector: { phone: null },
				customer: {
					...pendingStop().customer,
					collector: { phone: null },
				},
			}),
		);
		mocks.orgFind.mockResolvedValue({
			...ORG,
			reminderFallbackPhone: "+9611234567",
		});
		await expect(call({ dryRun: true })).resolves.toMatchObject({
			contactPhone: "01234567",
		});

		mocks.orgFind.mockResolvedValue(ORG);
		await expect(call()).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	it("dry run previews without writing or queueing", async () => {
		const result = await call({ dryRun: true });
		expect(result).toMatchObject({
			dryRun: true,
			customerPhone: "+96170111222",
			contactPhone: "76878870",
			suppressed: false,
		});
		expect(String(result["smsText"])).toContain("76878870");
		expect(mocks.paymentUpdate).not.toHaveBeenCalled();
		expect(mocks.createManyAndReturn).not.toHaveBeenCalled();
		expect(mocks.queue).not.toHaveBeenCalled();
	});

	it("stamps the payment, writes one row per channel and queues them", async () => {
		mocks.suppressionCount.mockResolvedValue(1);

		const result = await call();

		expect(mocks.paymentUpdate).toHaveBeenCalledWith({
			where: { id: "pay-1" },
			data: {
				stopNoticeSentAt: expect.any(Date),
				stopNoticeSentById: "admin-1",
			},
			select: { id: true },
		});
		const rows = mocks.createManyAndReturn.mock.calls[0]?.[0].data;
		expect(rows).toEqual([
			expect.objectContaining({
				kind: "stop_notice",
				channel: "whatsapp",
				paymentId: "pay-1",
				phone: "96170111222",
				contactPhone: "76878870",
				templateName: "stop_request_notice",
				status: "queued",
				sentById: "admin-1",
			}),
			expect.objectContaining({ channel: "sms", status: "queued" }),
		]);
		expect(mocks.appendLog).toHaveBeenCalledOnce();
		expect(mocks.queue).toHaveBeenCalledWith(["n1", "n2"]);
		// Opt-outs are not applied to a manual notice, only flagged.
		expect(result).toMatchObject({ suppressed: true });
	});

	it("sends only on the channels switched on in the org's settings", async () => {
		mocks.orgFind.mockResolvedValue({ ...ORG, expiryReminderSms: false });

		const result = await call();

		const rows = mocks.createManyAndReturn.mock.calls[0]?.[0].data;
		expect(rows).toEqual([
			expect.objectContaining({ channel: "whatsapp", status: "queued" }),
		]);
		expect(mocks.queue).toHaveBeenCalledWith(["n1"]);
		expect(result).toMatchObject({ smsText: null });
	});

	it("leaves out a channel that reached its monthly limit for the customer", async () => {
		mocks.orgFind.mockResolvedValue({
			...ORG,
			stopNoticeSmsLimit: 1,
			stopNoticeWhatsappLimit: 2,
		});
		mocks.notificationGroupBy.mockResolvedValue([
			{ channel: "sms", _count: { _all: 1 } },
			{ channel: "whatsapp", _count: { _all: 1 } },
		]);

		const result = await call();

		const rows = mocks.createManyAndReturn.mock.calls[0]?.[0].data;
		expect(rows).toEqual([
			expect.objectContaining({ channel: "whatsapp", status: "queued" }),
		]);
		expect(result).toMatchObject({
			limited: [{ channel: "sms", limit: 1, used: 1 }],
		});
	});

	it("refuses when every channel reached its monthly limit", async () => {
		mocks.orgFind.mockResolvedValue({
			...ORG,
			stopNoticeSmsLimit: 1,
			stopNoticeWhatsappLimit: 2,
		});
		mocks.notificationGroupBy.mockResolvedValue([
			{ channel: "sms", _count: { _all: 1 } },
			{ channel: "whatsapp", _count: { _all: 2 } },
		]);

		await expect(call()).rejects.toMatchObject({
			code: "TOO_MANY_REQUESTS",
		});
		expect(mocks.createManyAndReturn).not.toHaveBeenCalled();
	});

	it("refuses when both channels are switched off", async () => {
		mocks.orgFind.mockResolvedValue({
			...ORG,
			expiryReminderWhatsapp: false,
			expiryReminderSms: false,
		});

		await expect(call()).rejects.toThrow(/both switched off/);
		expect(mocks.createManyAndReturn).not.toHaveBeenCalled();
	});
});
