import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
	stockItem: { update: vi.fn() },
	stockLog: { create: vi.fn() },
	stockItemSupplier: { createMany: vi.fn() },
};

vi.mock("@repo/database", () => ({
	MAX_PHONES: 5,
	db: {
		supplier: {
			findFirst: vi.fn(),
			findMany: vi.fn(),
			create: vi.fn(),
			update: vi.fn(),
		},
		stockItem: { findFirst: vi.fn() },
		stockLog: { findMany: vi.fn(), count: vi.fn() },
		$transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
			fn(tx),
		),
	},
}));

vi.mock("@repo/api/lib/permission", () => ({
	requirePermission: vi.fn(async () => ({ activeDealerId: "dealer-1" })),
	getDealerScopeFilter: vi.fn(() => ({ dealerId: "dealer-1" })),
}));

import { db } from "@repo/database";
import { addStockQuantity } from "../procedures/add-quantity";
import { listStockLogs } from "../procedures/list-logs";
import { createSupplier, listSuppliers } from "../procedures/suppliers";

const mockDb = vi.mocked(db, true);
const orgId = "org-1";

function call<T>(
	procedure: unknown,
	input: Record<string, unknown>,
): Promise<T> {
	return (
		procedure as {
			"~orpc": { handler: (args: unknown) => Promise<T> };
		}
	)["~orpc"].handler({
		context: { user: { id: "user-1" }, headers: new Headers() },
		input: { organizationId: orgId, ...input },
	});
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("createSupplier", () => {
	it("refuses a duplicate active name with CONFLICT", async () => {
		mockDb.supplier.findFirst.mockResolvedValue({
			id: "sup-1",
			archivedAt: null,
		} as never);
		await expect(
			call(createSupplier, { name: "RINO", phones: [] }),
		).rejects.toMatchObject({ code: "CONFLICT" });
		expect(mockDb.supplier.create).not.toHaveBeenCalled();
	});

	it("restores an archived supplier with the same name", async () => {
		mockDb.supplier.findFirst.mockResolvedValue({
			id: "sup-1",
			archivedAt: new Date(),
		} as never);
		mockDb.supplier.update.mockResolvedValue({ id: "sup-1" } as never);
		await call(createSupplier, { name: "RINO", phones: [] });
		expect(mockDb.supplier.update).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { id: "sup-1" },
				data: expect.objectContaining({ archivedAt: null }),
			}),
		);
		expect(mockDb.supplier.create).not.toHaveBeenCalled();
	});
});

describe("listSuppliers", () => {
	it("hides archived suppliers by default", async () => {
		mockDb.supplier.findMany.mockResolvedValue([]);
		await call(listSuppliers, {});
		expect(mockDb.supplier.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: { organizationId: orgId, archivedAt: null },
			}),
		);
	});

	it("lists archived ones on request", async () => {
		mockDb.supplier.findMany.mockResolvedValue([]);
		await call(listSuppliers, { includeArchived: true });
		expect(mockDb.supplier.findMany).toHaveBeenCalledWith(
			expect.objectContaining({ where: { organizationId: orgId } }),
		);
	});
});

describe("addStockQuantity", () => {
	it("links the delivering supplier to the item", async () => {
		mockDb.stockItem.findFirst.mockResolvedValue({ id: "item-1" } as never);
		mockDb.supplier.findFirst.mockResolvedValue({ id: "sup-1" } as never);
		tx.stockItem.update.mockResolvedValue({
			id: "item-1",
			name: "Router",
			quantity: 15,
		});
		await call(addStockQuantity, {
			id: "item-1",
			quantity: 5,
			supplierId: "sup-1",
			notes: "Invoice 42",
		});
		expect(tx.stockLog.create).toHaveBeenCalledWith({
			data: expect.objectContaining({
				action: "ADD",
				supplierId: "sup-1",
				notes: "Invoice 42",
			}),
		});
		expect(tx.stockItemSupplier.createMany).toHaveBeenCalledWith({
			data: [{ stockItemId: "item-1", supplierId: "sup-1" }],
			skipDuplicates: true,
		});
	});

	it("does not link a supplier on a negative adjustment", async () => {
		mockDb.stockItem.findFirst.mockResolvedValue({ id: "item-1" } as never);
		mockDb.supplier.findFirst.mockResolvedValue({ id: "sup-1" } as never);
		tx.stockItem.update.mockResolvedValue({
			id: "item-1",
			name: "Router",
			quantity: 5,
		});
		await call(addStockQuantity, {
			id: "item-1",
			quantity: -2,
			supplierId: "sup-1",
		});
		expect(tx.stockItemSupplier.createMany).not.toHaveBeenCalled();
	});
});

describe("listStockLogs", () => {
	it("filters by supplier", async () => {
		mockDb.stockLog.findMany.mockResolvedValue([]);
		mockDb.stockLog.count.mockResolvedValue(0);
		await call(listStockLogs, { supplierId: "sup-1" });
		expect(mockDb.stockLog.findMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: expect.objectContaining({ supplierId: "sup-1" }),
			}),
		);
	});
});
