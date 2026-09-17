import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
	cashCollection: { delete: vi.fn(), deleteMany: vi.fn() },
	expense: { deleteMany: vi.fn() },
	installation: { findMany: vi.fn() },
	customer: { update: vi.fn() },
};

vi.mock("@repo/database", () => ({
	db: {
		cashCollection: { findFirst: vi.fn() },
		$transaction: vi.fn(),
	},
}));

vi.mock("@repo/api/lib/permission", () => ({
	requirePermission: vi.fn(),
	hasActionInRole: vi.fn(() => true),
	verifyCustomerOwnership: vi.fn(),
}));

vi.mock("@repo/auth/lib/audit", () => ({
	cashAudit: { transferReverted: vi.fn() },
	customerAudit: { deleted: vi.fn() },
	getAuditContextFromHeaders: vi.fn(() => ({})),
}));

vi.mock("../../customers/lib/iradius-api", () => ({
	iradiusSetActive: vi.fn(),
}));

vi.mock("../../customers/lib/iradius-mirror", () => ({
	mirrorToIRadius: vi.fn(),
}));

vi.mock("../../expenses/lib/stats-cache", () => ({
	bustExpenseStats: vi.fn(),
}));

vi.mock("../../installations/procedures/review", () => ({
	revertApprovedInstallation: vi.fn(),
}));

vi.mock("../lib/cash-cache", () => ({
	bustCashStats: vi.fn(),
}));

import { requirePermission } from "@repo/api/lib/permission";
import { cashAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { deleteCollection } from "../procedures/delete-collection";

const mockDb = vi.mocked(db);
const user = { id: "user-1" };
const orgId = "org-1";

const LEG = {
	id: "cc-out",
	type: "ADMIN_TRANSFER",
	externalBillingId: null,
	expenseId: null,
	installationId: null,
	setupRequestId: null,
	transferId: "tr-1",
	setupRequest: null,
};

function call(input: Record<string, unknown>) {
	return (
		deleteCollection as unknown as {
			"~orpc": { handler: (args: unknown) => Promise<unknown> };
		}
	)["~orpc"].handler({
		context: { user, headers: new Headers() },
		input: { organizationId: orgId, deactivateCustomer: false, ...input },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(requirePermission).mockResolvedValue({
		member: {} as never,
		permCtx: {} as never,
		activeDealerId: null,
		iradiusDisabled: false,
	});
	mockDb.$transaction.mockImplementation((async (
		fn: (t: typeof tx) => Promise<unknown>,
	) => fn(tx)) as never);
});

describe("billing.collections.delete — cash moves", () => {
	it("removes both legs of a transfer in one transaction", async () => {
		mockDb.cashCollection.findFirst.mockResolvedValue(LEG as never);

		const result = await call({ collectionId: LEG.id });

		expect(tx.cashCollection.delete).toHaveBeenCalledWith({
			where: { id: LEG.id },
		});
		expect(tx.cashCollection.deleteMany).toHaveBeenCalledWith({
			where: {
				organizationId: orgId,
				transferId: "tr-1",
				externalBillingId: null,
			},
		});
		expect(result).toMatchObject({ transferReverted: true });
		expect(vi.mocked(cashAudit.transferReverted)).toHaveBeenCalledWith(
			"tr-1",
			user.id,
			orgId,
			{},
			{ deletedCollectionId: LEG.id },
		);
	});

	it("leaves other rows alone for a plain entry", async () => {
		mockDb.cashCollection.findFirst.mockResolvedValue({
			...LEG,
			type: "HANDOFF",
			transferId: null,
		} as never);

		const result = await call({ collectionId: LEG.id });

		expect(tx.cashCollection.delete).toHaveBeenCalledTimes(1);
		expect(tx.cashCollection.deleteMany).not.toHaveBeenCalled();
		expect(result).toMatchObject({ transferReverted: false });
		expect(vi.mocked(cashAudit.transferReverted)).not.toHaveBeenCalled();
	});

	it("keeps imported rows read-only", async () => {
		mockDb.cashCollection.findFirst.mockResolvedValue({
			...LEG,
			externalBillingId: 42,
		} as never);

		await expect(call({ collectionId: LEG.id })).rejects.toMatchObject({
			code: "BAD_REQUEST",
		});
		expect(mockDb.$transaction).not.toHaveBeenCalled();
	});
});
