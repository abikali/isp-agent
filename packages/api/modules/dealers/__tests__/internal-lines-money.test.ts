import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	fetchDealerPayments,
	fetchWholesaleRevenue,
} from "../../finance/lib/queries";
import { dealerWhereForScope } from "../lib/scope";

const mocks = vi.hoisted(() => ({
	db: {
		ispDealer: { findMany: vi.fn() },
		organization: { findUnique: vi.fn() },
		dealerCharge: { aggregate: vi.fn(), findFirst: vi.fn() },
		ispDealerAccount: { findMany: vi.fn() },
	},
}));

vi.mock("@repo/database", () => ({ db: mocks.db }));
vi.mock("@repo/api/lib/permission", () => ({
	hasPermission: vi.fn(),
	requirePermission: vi.fn(),
	resolveCollectorScope: vi.fn(),
}));

// abiroot: master johnnyh + internal line LIBANCOM-FIBER.
const ORG = "org-abiroot";
const MASTER = "dealer-johnnyh";
const FIBER = "dealer-libancom-fiber";

const period = {
	from: new Date("2026-10-01T00:00:00Z"),
	to: new Date("2026-11-01T00:00:00Z"),
	label: "October 2026",
	months: [{ year: 2026, month: 10 }],
};

beforeEach(() => {
	vi.clearAllMocks();
	mocks.db.ispDealer.findMany.mockResolvedValue([{ id: FIBER }]);
	mocks.db.dealerCharge.aggregate.mockResolvedValue({
		_sum: { debit: 0 },
		_count: 0,
	});
	mocks.db.dealerCharge.findFirst.mockResolvedValue(null);
	mocks.db.organization.findUnique.mockResolvedValue({
		isWholesaleOperator: true,
	});
	mocks.db.ispDealerAccount.findMany.mockResolvedValue([]);
});

describe("dealerWhereForScope", () => {
	it("hides the operator's master and internal lines from its dealer list", () => {
		expect(
			dealerWhereForScope({
				isOperator: true,
				activeDealerId: MASTER,
				ownDealerIds: [MASTER, FIBER],
			}),
		).toEqual({ id: { notIn: [MASTER, FIBER] } });
	});

	it("shows an operator with no own accounts every dealer", () => {
		expect(
			dealerWhereForScope({
				isOperator: true,
				activeDealerId: null,
				ownDealerIds: [],
			}),
		).toEqual({});
	});

	it("still limits a reseller org to its own dealer", () => {
		expect(
			dealerWhereForScope({
				isOperator: false,
				activeDealerId: "dealer-dotnet2",
				ownDealerIds: ["dealer-dotnet2"],
			}),
		).toEqual({ id: "dealer-dotnet2" });
	});
});

describe("fetchWholesaleRevenue", () => {
	it("excludes charges booked against the master and the internal lines", async () => {
		await fetchWholesaleRevenue(
			{ organizationId: ORG, activeDealerId: MASTER },
			period,
		);

		expect(mocks.db.ispDealer.findMany).toHaveBeenCalledWith({
			where: { internalLineOfOrganizationId: ORG },
			select: { id: true },
		});
		const [aggregate] = mocks.db.dealerCharge.aggregate.mock.calls[0] ?? [];
		expect(aggregate.where.dealerId).toEqual({ notIn: [MASTER, FIBER] });
		const [first] = mocks.db.dealerCharge.findFirst.mock.calls[0] ?? [];
		expect(first.where.dealerId).toEqual({ notIn: [MASTER, FIBER] });
	});

	it("applies no dealer filter for an org with no own accounts", async () => {
		mocks.db.ispDealer.findMany.mockResolvedValue([]);
		await fetchWholesaleRevenue(
			{ organizationId: ORG, activeDealerId: null },
			period,
		);
		const [aggregate] = mocks.db.dealerCharge.aggregate.mock.calls[0] ?? [];
		expect(aggregate.where).not.toHaveProperty("dealerId");
	});
});

describe("fetchDealerPayments", () => {
	it("does not count ledger payments on the master or the internal lines", async () => {
		await fetchDealerPayments(
			{ organizationId: ORG, activeDealerId: MASTER },
			period,
		);
		const [query] = mocks.db.ispDealerAccount.findMany.mock.calls[0] ?? [];
		expect(query.where.dealerId).toEqual({ notIn: [MASTER, FIBER] });
	});
});
