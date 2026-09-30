import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
	customer: { update: vi.fn() },
	customerInvoice: { create: vi.fn(async (args: unknown) => args) },
};

vi.mock("@repo/database", () => ({
	db: {
		customer: { findFirst: vi.fn() },
		customerInvoice: { findUnique: vi.fn(), create: vi.fn() },
		$transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
	},
}));

vi.mock("@repo/api/lib/permission", () => ({
	requirePermission: vi.fn(),
	getDealerScopeFilter: vi.fn(() => ({})),
}));

vi.mock("../../customers/lib/reactivate-in-iradius", () => ({
	reactivateInIRadius: vi.fn(),
}));

import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { reactivateInIRadius } from "../../customers/lib/reactivate-in-iradius";
import { createInvoice } from "../procedures/create-invoice";

const mockDb = vi.mocked(db, true);
const renewed = new Date("2026-10-30T23:59:56");

function call(input: Record<string, unknown>) {
	return (
		createInvoice as unknown as {
			"~orpc": { handler: (args: unknown) => Promise<unknown> };
		}
	)["~orpc"].handler({
		context: { user: { id: "admin-1" }, headers: new Headers() },
		input: {
			organizationId: "org-1",
			customerId: "cust-1",
			year: 2026,
			month: 10,
			accountPrice: 20,
			discount: 0,
			tax: 0,
			...input,
		},
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requirePermission).mockResolvedValue({
		activeDealerId: null,
		iradiusDisabled: false,
	} as never);
	mockDb.customer.findFirst.mockResolvedValue({
		id: "cust-1",
		expiresAt: new Date("2026-08-01T23:59:56Z"),
		externalId: "84567",
		status: "INACTIVE",
	} as never);
	mockDb.customerInvoice.findUnique.mockResolvedValue(null);
	vi.mocked(reactivateInIRadius).mockResolvedValue({ expiresAt: renewed });
});

describe("createInvoice with renewInIRadius", () => {
	it("renews first, then freezes the renewed expiry on the invoice", async () => {
		await call({ renewInIRadius: true, activate: true });

		expect(reactivateInIRadius).toHaveBeenCalledWith(
			expect.objectContaining({
				activate: true,
				renew: true,
				customExpiryDate: null,
			}),
		);
		expect(tx.customer.update).toHaveBeenCalledWith({
			where: { id: "cust-1" },
			data: { expiresAt: renewed, status: "ACTIVE" },
		});
		const created = tx.customerInvoice.create.mock.calls[0]?.[0] as {
			data: { expiryDate: Date };
		};
		expect(created.data.expiryDate).toEqual(renewed);
		expect(mockDb.customerInvoice.create).not.toHaveBeenCalled();
	});

	it("never renews when the month already has an invoice", async () => {
		mockDb.customerInvoice.findUnique.mockResolvedValue({
			id: "inv-1",
		} as never);
		await expect(
			call({ renewInIRadius: true, activate: true }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(reactivateInIRadius).not.toHaveBeenCalled();
	});

	it("writes nothing locally when the renew fails", async () => {
		vi.mocked(reactivateInIRadius).mockRejectedValue(new Error("boom"));
		await expect(call({ renewInIRadius: true })).rejects.toThrow();
		expect(mockDb.$transaction).not.toHaveBeenCalled();
	});

	it("refuses to renew an unlinked customer", async () => {
		mockDb.customer.findFirst.mockResolvedValue({
			id: "cust-1",
			expiresAt: null,
			externalId: null,
			status: "ACTIVE",
		} as never);
		await expect(call({ renewInIRadius: true })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(reactivateInIRadius).not.toHaveBeenCalled();
	});

	it("stays local-only without the flag", async () => {
		await call({});
		expect(reactivateInIRadius).not.toHaveBeenCalled();
		expect(mockDb.customerInvoice.create).toHaveBeenCalledTimes(1);
	});
});
