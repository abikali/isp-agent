import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@repo/database", () => ({ db: { customer: { findFirst } } }));
vi.mock("@repo/logs", () => ({
	logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { loadLocalPlan } from "../lib/local-plan";

const LEGACY_6M = {
	id: "plan-6m",
	name: "johnnyh-UP TO 6M",
	downloadSpeed: 6,
	uploadSpeed: 6,
	monthlyPrice: 40,
};

beforeEach(() => {
	findFirst.mockReset();
});

describe("loadLocalPlan", () => {
	it("returns the plan with the subscriber's own monthly rate", async () => {
		findFirst.mockResolvedValue({ monthlyRate: 35, plan: LEGACY_6M });

		const plan = await loadLocalPlan("org-1", "josephsmeha", [
			"plan-6m-new",
		]);

		expect(plan).toEqual({
			planName: "johnnyh-UP TO 6M",
			monthlyPriceUsd: 35,
			downloadMbps: 6,
			uploadMbps: 6,
			inCurrentCatalog: false,
		});
		expect(findFirst.mock.calls[0]?.[0].where).toEqual({
			organizationId: "org-1",
			username: "josephsmeha",
			deletedAt: null,
		});
	});

	it("falls back to the plan price and flags catalog plans", async () => {
		findFirst.mockResolvedValue({ monthlyRate: null, plan: LEGACY_6M });

		const plan = await loadLocalPlan("org-1", "josephsmeha", ["plan-6m"]);

		expect(plan?.monthlyPriceUsd).toBe(40);
		expect(plan?.inCurrentCatalog).toBe(true);
	});

	it("returns null when the customer has no plan or the lookup fails", async () => {
		findFirst.mockResolvedValueOnce({ monthlyRate: 35, plan: null });
		expect(await loadLocalPlan("org-1", "x")).toBeNull();

		findFirst.mockRejectedValueOnce(new Error("db down"));
		expect(await loadLocalPlan("org-1", "x")).toBeNull();
	});
});
