import { beforeEach, describe, expect, it, vi } from "vitest";

const order: string[] = [];

const tx = {
	payment: {
		update: vi.fn(async () => {
			order.push("local:payment");
		}),
	},
	customer: {
		update: vi.fn(async () => {
			order.push("local:customer");
		}),
	},
};

vi.mock("@repo/database", () => ({
	db: {
		$transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
		customerInvoice: { findMany: vi.fn() },
		billingMonth: { findMany: vi.fn() },
		payment: { findMany: vi.fn() },
	},
}));

vi.mock("@repo/jobs", () => ({ queueWhatsAppReferralReward: vi.fn() }));

vi.mock("@repo/auth/lib/audit", () => ({
	customerAudit: { deleted: vi.fn() },
}));

vi.mock("../../customers/lib/iradius-api", () => {
	class IRadiusUserNotFoundError extends Error {}
	return {
		IRadiusUserNotFoundError,
		iradiusSetActive: vi.fn(async () => {
			order.push("remote:setActive(false)");
		}),
		iradiusDeleteUser: vi.fn(async () => {
			order.push("remote:deleteUser");
			return { alreadyDeleted: false };
		}),
	};
});

vi.mock("../lib/invoice-void", () => ({
	VOID_REASON: { STOPPED: "stopped" },
	voidInvoice: vi.fn(async () => {
		order.push("local:voidInvoice");
	}),
}));

vi.mock("../lib/review-tasks", () => ({
	closeReviewTasksForCustomer: vi.fn(),
}));

import { customerAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import {
	iradiusDeleteUser,
	iradiusSetActive,
} from "../../customers/lib/iradius-api";
import { reviewOnePayment } from "../lib/review-payment-core";

const mockDb = vi.mocked(db, true);

const payment = {
	id: "pay-1",
	customerId: "cust-1",
	invoiceId: "inv-stop",
	stoppedAccount: true,
	freeAccount: false,
	referredCustomerId: null,
	referralRewardNotifiedAt: null,
	customer: { externalId: "84567", username: "jdoe" },
};

function review(extra: Record<string, unknown> = {}) {
	return reviewOnePayment({
		organizationId: "org-1",
		userId: "admin-1",
		payment,
		stopAction: "delete",
		operatorName: "Jhonny",
		...extra,
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	order.length = 0;
	mockDb.customerInvoice.findMany.mockResolvedValue([]);
	mockDb.billingMonth.findMany.mockResolvedValue([]);
	mockDb.payment.findMany.mockResolvedValue([]);
});

describe("reviewOnePayment — Inactive + delete", () => {
	it("deactivates, deletes in iRadius, then runs the local soft-delete", async () => {
		await review();

		expect(order).toEqual([
			"remote:setActive(false)",
			"remote:deleteUser",
			"local:payment",
			"local:customer",
			"local:voidInvoice",
		]);
		expect(iradiusSetActive).toHaveBeenCalledWith(payment.customer, false, {
			tolerateMissing: true,
		});
		expect(iradiusDeleteUser).toHaveBeenCalledWith(
			payment.customer,
			"Jhonny",
		);
		expect(tx.customer.update).toHaveBeenCalledWith({
			where: { id: "cust-1" },
			data: { status: "INACTIVE", deletedAt: expect.any(Date) },
		});
		expect(customerAudit.deleted).toHaveBeenCalled();
	});

	it("never runs the local transaction when the iRadius delete fails", async () => {
		vi.mocked(iradiusDeleteUser).mockRejectedValueOnce(
			new Error("iRadius bridge missing (HTTP 404)"),
		);
		await expect(review()).rejects.toMatchObject({
			message: expect.stringMatching(/bridge missing/),
		});
		expect(mockDb.$transaction).not.toHaveBeenCalled();
		expect(customerAudit.deleted).not.toHaveBeenCalled();
	});

	it("refuses while other months are owed, before any remote call", async () => {
		mockDb.customerInvoice.findMany.mockResolvedValue([
			{ year: 2026, month: 8, total: 20, totalWithTax: 20 },
		] as never);
		mockDb.billingMonth.findMany.mockResolvedValue([
			{ id: "bm-aug", year: 2026, month: 8 },
		] as never);

		await expect(review()).rejects.toMatchObject({
			code: "CONFLICT",
			message: expect.stringMatching(/owes 1 month/),
		});
		expect(iradiusSetActive).not.toHaveBeenCalled();
		expect(iradiusDeleteUser).not.toHaveBeenCalled();
		// The stop's own invoice is excluded from the owed count.
		expect(mockDb.customerInvoice.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ id: { not: "inv-stop" } }),
			}),
		);
	});

	it("does not count a month that is paid", async () => {
		mockDb.customerInvoice.findMany.mockResolvedValue([
			{ year: 2026, month: 8, total: 20, totalWithTax: 20 },
		] as never);
		mockDb.billingMonth.findMany.mockResolvedValue([
			{ id: "bm-aug", year: 2026, month: 8 },
		] as never);
		mockDb.payment.findMany.mockResolvedValue([
			{
				customerId: "cust-1",
				billingMonthId: "bm-aug",
				paidAmount: 20,
				discount: 0,
				freeAccount: false,
				paidAt: new Date("2026-09-10T00:00:00Z"),
			},
		] as never);
		await review();
		expect(iradiusDeleteUser).toHaveBeenCalled();
	});

	it("proceeds past owed months with the explicit override", async () => {
		mockDb.customerInvoice.findMany.mockResolvedValue([
			{ year: 2026, month: 8, total: 20, totalWithTax: 20 },
		] as never);
		await review({ ignoreOwedMonths: true });
		expect(iradiusDeleteUser).toHaveBeenCalled();
		expect(mockDb.customerInvoice.findMany).not.toHaveBeenCalled();
	});

	it("iRadius-disabled org: local soft-delete only", async () => {
		await review({ iradiusDisabled: true });
		expect(iradiusSetActive).not.toHaveBeenCalled();
		expect(iradiusDeleteUser).not.toHaveBeenCalled();
		expect(tx.customer.update).toHaveBeenCalledWith({
			where: { id: "cust-1" },
			data: { status: "INACTIVE", deletedAt: expect.any(Date) },
		});
	});

	it("unlinked customer: no iRadius delete, still soft-deleted", async () => {
		await reviewOnePayment({
			organizationId: "org-1",
			userId: "admin-1",
			payment: {
				...payment,
				customer: { externalId: null, username: null },
			},
			stopAction: "delete",
		});
		expect(iradiusDeleteUser).not.toHaveBeenCalled();
		expect(tx.customer.update).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ deletedAt: expect.any(Date) }),
			}),
		);
	});

	it("inactive only: no delete, no soft-delete", async () => {
		await review({ stopAction: "inactive" });
		expect(iradiusDeleteUser).not.toHaveBeenCalled();
		expect(tx.customer.update).toHaveBeenCalledWith({
			where: { id: "cust-1" },
			data: { status: "INACTIVE" },
		});
	});
});
