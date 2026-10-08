import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	customers: vi.fn(),
	areas: vi.fn(),
	leads: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		customer: { findMany: mocks.customers },
		fiberArea: { findMany: mocks.areas },
		fiberLead: { findMany: mocks.leads },
	},
}));
vi.mock("@repo/api/lib/permission", () => ({
	getDealerScopeFilter: () => ({}),
}));

import { isAtRisk, scoreActiveCustomers } from "../lib/queries";

function customer(id: string, extra: Record<string, unknown> = {}) {
	return {
		id,
		firstName: id,
		lastName: null,
		username: id,
		groupName: "Sabtiye ",
		mobile: null,
		landline: null,
		hasLandline: null,
		monthlyRate: 25,
		plan: null,
		...extra,
	};
}

describe("scoreActiveCustomers", () => {
	beforeEach(() => {
		mocks.areas.mockResolvedValue([{ area: "sabtiye", status: "ROLLOUT" }]);
		mocks.leads.mockResolvedValue([]);
	});

	it("scores by reasons, puts the riskiest and best-paying first, skips won", async () => {
		mocks.customers.mockResolvedValue([
			customer("area-only"),
			customer("area-landline", { hasLandline: true, monthlyRate: 35 }),
			customer("elsewhere", { groupName: "bsaba", hasLandline: true }),
			customer("approached", { groupName: "bsaba" }),
			customer("won"),
			customer("added-by-staff", {
				groupName: "bsaba",
				hasLandline: true,
			}),
		]);
		mocks.leads.mockResolvedValue([
			{
				id: "l1",
				customerId: "approached",
				stage: "CONTACTED",
				source: "BOT",
				ogeroApproached: true,
			},
			{
				id: "l2",
				customerId: "won",
				stage: "WON",
				source: "BOT",
				ogeroApproached: false,
			},
			{
				id: "l3",
				customerId: "added-by-staff",
				stage: "NEW",
				source: "CUSTOMER_BASE",
				ogeroApproached: false,
			},
		]);

		const scored = await scoreActiveCustomers("org", null);
		expect(scored.map((c) => c.id)).toEqual([
			"approached",
			"area-landline",
			"area-only",
			"elsewhere",
			"added-by-staff",
		]);
		expect(scored[0]?.reasons).toEqual(["OGERO_APPROACHED", "ASKED_FIBER"]);
		expect(scored[2]?.area).toBe("sabtiye");
		// Being put in the pipeline by staff is not the customer asking.
		expect(scored[4]?.reasons).toEqual(["HAS_LANDLINE"]);
		// Landline alone is a warning, not "at risk".
		expect(isAtRisk(scored[3] as never)).toBe(false);
		expect(isAtRisk(scored[2] as never)).toBe(true);
	});
});
