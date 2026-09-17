import type { IRadiusConnection } from "@repo/database/iradius";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveWholesaleScope, syncDealerCharges } from "../dealer-charges";

const mocks = vi.hoisted(() => ({
	queryIRadius: vi.fn(),
	db: {
		ispDealer: { findMany: vi.fn() },
		organization: { findUnique: vi.fn() },
		dealerCharge: { findFirst: vi.fn(), createMany: vi.fn() },
	},
}));

vi.mock("@repo/database", () => ({ db: mocks.db }));
vi.mock("@repo/database/iradius", () => ({
	queryIRadius: mocks.queryIRadius,
}));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const conn = {} as IRadiusConnection;

// abiroot in iRadius: johnnyh (53853) and LIBANCOM-FIBER (84545) are both
// top-level (ParentId = 1) next to the resellers 70000 and 70001.
// 90000 is a sub-dealer of johnnyh, 90001 a sub-dealer of the fiber line.
function fakeIRadius(
	_conn: IRadiusConnection,
	sql: string,
	params?: Array<string | number | null>,
) {
	if (sql.includes("FROM DealerBillingLog")) {
		return Promise.resolve([
			billingRow(1, "84545"),
			billingRow(2, "53853"),
			billingRow(3, "70000"),
			billingRow(4, "90001"),
		]);
	}
	if (sql.includes("ParentId = 1")) {
		return Promise.resolve(
			["53853", "84545", "70000", "70001"].map((Id) => ({ Id })),
		);
	}
	if (sql.includes("ParentId IN")) {
		const children: Record<string, string[]> = {
			"53853": ["90000"],
			"84545": ["90001"],
		};
		return Promise.resolve(
			(params ?? []).flatMap((p) =>
				(children[String(p)] ?? []).map((Id) => ({ Id })),
			),
		);
	}
	return Promise.resolve([]);
}

function billingRow(id: number, dealerId: string) {
	return {
		Id: id,
		DealerId: dealerId,
		UserId: 1,
		Type: "RENEW USER",
		Credit: 0,
		Commission: 0,
		Debit: 17,
		OperationDate: "2026-10-06 10:00:00",
		Description: null,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	mocks.queryIRadius.mockImplementation(fakeIRadius);
});

describe("resolveWholesaleScope", () => {
	it("keeps the operator's own internal line out of wholesale scope", async () => {
		const scope = await resolveWholesaleScope(conn, {
			masterExternalId: "53853",
			lineExternalIds: ["84545"],
			isOperator: true,
		});
		expect([...scope].sort()).toEqual(["70000", "70001", "90000", "90001"]);
	});

	it("treats a line as a reseller when it is not linked (regression guard)", async () => {
		const scope = await resolveWholesaleScope(conn, {
			masterExternalId: "53853",
			lineExternalIds: [],
			isOperator: true,
		});
		expect(scope.has("84545")).toBe(true);
		expect(scope.has("53853")).toBe(false);
	});

	it("scopes a reseller org to the children of its master and lines", async () => {
		const scope = await resolveWholesaleScope(conn, {
			masterExternalId: "53853",
			lineExternalIds: ["84545"],
			isOperator: false,
		});
		expect([...scope].sort()).toEqual(["90000", "90001"]);
		expect(mocks.queryIRadius).toHaveBeenCalledWith(
			conn,
			expect.stringContaining("ParentId IN (?, ?)"),
			["53853", "84545"],
		);
	});

	it("is empty without a master and never queries iRadius", async () => {
		const scope = await resolveWholesaleScope(conn, {
			masterExternalId: null,
			lineExternalIds: ["84545"],
			isOperator: true,
		});
		expect(scope.size).toBe(0);
		expect(mocks.queryIRadius).not.toHaveBeenCalled();
	});
});

describe("syncDealerCharges", () => {
	it("stores reseller charges but not the master's or the internal line's", async () => {
		mocks.db.ispDealer.findMany.mockResolvedValue(
			["53853", "84545", "70000", "90001"].map((externalId) => ({
				id: `dealer-${externalId}`,
				externalId,
				organizationId: null,
			})),
		);
		mocks.db.organization.findUnique.mockResolvedValue({
			isWholesaleOperator: true,
			activeDealer: { externalId: "53853" },
			internalDealerLines: [{ externalId: "84545" }],
		});
		mocks.db.dealerCharge.findFirst.mockResolvedValue({
			operationDate: new Date("2026-10-01T00:00:00Z"),
		});
		mocks.db.dealerCharge.createMany.mockImplementation(
			({ data }: { data: unknown[] }) =>
				Promise.resolve({ count: data.length }),
		);

		const result = await syncDealerCharges(conn, "org-abiroot");

		const stored = mocks.db.dealerCharge.createMany.mock.calls.flatMap(
			(args: Array<{ data: Array<{ dealerId: string }> }>) =>
				args[0]?.data.map((row) => row.dealerId) ?? [],
		);
		expect(stored).toEqual(["dealer-70000", "dealer-90001"]);
		expect(result).toEqual({ created: 2, skipped: 2, errors: 0 });
	});
});
