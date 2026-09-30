import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	tx: {
		payment: { update: vi.fn() },
		customer: { update: vi.fn() },
	},
	scheduleOutreach: vi.fn(),
	queueWhatsAppReferralReward: vi.fn(),
	iradiusSetActive: vi.fn(),
	closeReviewTasksForCustomer: vi.fn(),
	voidInvoice: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		$transaction: (fn: (tx: typeof mocks.tx) => Promise<unknown>) =>
			fn(mocks.tx),
	},
}));
vi.mock("@repo/jobs", () => ({
	scheduleOutreach: mocks.scheduleOutreach,
	queueWhatsAppReferralReward: mocks.queueWhatsAppReferralReward,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../customers/lib/iradius-api", () => ({
	IRadiusUserNotFoundError: class extends Error {},
	iradiusSetActive: mocks.iradiusSetActive,
}));
vi.mock("../../customers/lib/iradius-mirror", () => ({
	// Remote first; the local write only runs when it succeeded.
	mirrorToIRadius: async (args: {
		remote: () => Promise<void>;
		local: () => Promise<unknown>;
	}) => {
		await args.remote();
		return args.local();
	},
}));
vi.mock("../lib/invoice-void", () => ({
	VOID_REASON: { STOPPED: "stopped" },
	voidInvoice: mocks.voidInvoice,
}));
vi.mock("../lib/review-tasks", () => ({
	closeReviewTasksForCustomer: mocks.closeReviewTasksForCustomer,
}));
vi.mock("../lib/referral-reward", () => ({
	isReferralRewardEligible: () => false,
}));

import { reviewOnePayment } from "../lib/review-payment-core";

function payment(stoppedAccount: boolean) {
	return {
		id: "pay-1",
		customerId: "cust-1",
		invoiceId: null,
		stoppedAccount,
		customer: { externalId: "812", username: "joe" },
	} as unknown as Parameters<typeof reviewOnePayment>[0]["payment"];
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.scheduleOutreach.mockResolvedValue({ status: "scheduled" });
	mocks.iradiusSetActive.mockResolvedValue(undefined);
});

describe("reviewOnePayment — day-after-stop follow-up", () => {
	it("schedules the stop follow-up after the remote deactivation", async () => {
		await reviewOnePayment({
			organizationId: "org-1",
			userId: "user-1",
			payment: payment(true),
		});
		expect(mocks.iradiusSetActive).toHaveBeenCalled();
		expect(mocks.scheduleOutreach).toHaveBeenCalledWith({
			type: "post_stop",
			organizationId: "org-1",
			customerId: "cust-1",
			paymentId: "pay-1",
		});
		expect(mocks.iradiusSetActive.mock.invocationCallOrder[0]).toBeLessThan(
			mocks.scheduleOutreach.mock.invocationCallOrder[0] ?? 0,
		);
	});

	it("does not schedule for an ordinary payment", async () => {
		await reviewOnePayment({
			organizationId: "org-1",
			userId: "user-1",
			payment: payment(false),
		});
		expect(mocks.scheduleOutreach).not.toHaveBeenCalled();
	});

	it("schedules nothing when iRadius refuses the deactivation", async () => {
		mocks.iradiusSetActive.mockRejectedValue(new Error("iRadius down"));
		await expect(
			reviewOnePayment({
				organizationId: "org-1",
				userId: "user-1",
				payment: payment(true),
			}),
		).rejects.toThrow("iRadius down");
		expect(mocks.scheduleOutreach).not.toHaveBeenCalled();
		expect(mocks.tx.customer.update).not.toHaveBeenCalled();
	});

	it("never fails the review when scheduling breaks", async () => {
		mocks.scheduleOutreach.mockRejectedValue(new Error("boom"));
		await expect(
			reviewOnePayment({
				organizationId: "org-1",
				userId: "user-1",
				payment: payment(true),
			}),
		).resolves.toEqual({ referralRewardQueued: false });
	});
});
