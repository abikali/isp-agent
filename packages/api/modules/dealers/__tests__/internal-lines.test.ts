import { beforeEach, describe, expect, it, vi } from "vitest";
import { iradiusGetUserParentId } from "../../customers/lib/iradius-api";
import {
	assertCustomerStaysOnLine,
	assertOwnPlan,
	assertSamePlanLine,
	lineOfIRadiusParent,
	type OrgDealerLines,
	resolveNewSubscriberParent,
	resolvePlanLine,
} from "../lib/internal-lines";

const findOrganization = vi.fn();
vi.mock("@repo/database", () => ({
	db: {
		organization: {
			findUnique: (...args: unknown[]) => findOrganization(...args),
		},
	},
}));
vi.mock("../../customers/lib/iradius-api", () => ({
	iradiusGetUserParentId: vi.fn(),
}));
const getParentId = vi.mocked(iradiusGetUserParentId);

// abiroot: master johnnyh (53853) + internal line LIBANCOM-FIBER (84545).
const lines: OrgDealerLines = {
	master: { id: "johnnyh", externalId: "53853" },
	lines: [{ id: "fiber", externalId: "84545", name: "LIBANCOM-FIBER" }],
};
const noLines: OrgDealerLines = { master: lines.master, lines: [] };

const wirelessPlan = { dealerId: "johnnyh", dealerExternalId: "53853" };
// Repointed at the master by the sync; dealerExternalId still names the line.
const fiberPlan = { dealerId: "johnnyh", dealerExternalId: "84545" };
// Stamped with the line before the sync repointed it.
const fiberPlanBeforeSync = { dealerId: "fiber", dealerExternalId: "84545" };
const resellerPlan = { dealerId: "dotnet2", dealerExternalId: "60001" };

describe("resolvePlanLine", () => {
	it("tells the master's plans from the line's", () => {
		expect(resolvePlanLine(wirelessPlan, lines)).toEqual({
			kind: "master",
		});
		expect(resolvePlanLine(fiberPlan, lines)).toMatchObject({
			kind: "line",
			externalId: "84545",
		});
		expect(resolvePlanLine(fiberPlanBeforeSync, lines)).toMatchObject({
			kind: "line",
			externalId: "84545",
		});
	});

	it("marks another dealer's plan as foreign", () => {
		expect(resolvePlanLine(resellerPlan, lines)).toEqual({
			kind: "foreign",
		});
	});

	it("treats unowned plans as the org's own when it has no master", () => {
		expect(
			resolvePlanLine(
				{ dealerId: null, dealerExternalId: null },
				{ master: null, lines: [] },
			),
		).toEqual({ kind: "master" });
	});
});

describe("assertSamePlanLine", () => {
	it("allows moves within a line", () => {
		expect(() =>
			assertSamePlanLine(wirelessPlan, wirelessPlan, lines),
		).not.toThrow();
		expect(() =>
			assertSamePlanLine(fiberPlanBeforeSync, fiberPlan, lines),
		).not.toThrow();
	});

	it("refuses moves between the master and a line, both ways", () => {
		expect(() =>
			assertSamePlanLine(wirelessPlan, fiberPlan, lines),
		).toThrow(/LIBANCOM-FIBER/);
		expect(() =>
			assertSamePlanLine(fiberPlan, wirelessPlan, lines),
		).toThrow(/between dealer lines/);
	});

	it("takes a customer with no plan to be on the master line", () => {
		expect(() => assertSamePlanLine(null, fiberPlan, lines)).toThrow();
		expect(() =>
			assertSamePlanLine(null, wirelessPlan, lines),
		).not.toThrow();
	});

	it("never blocks an org without internal lines", () => {
		expect(() =>
			assertSamePlanLine(resellerPlan, wirelessPlan, noLines),
		).not.toThrow();
	});
});

describe("assertOwnPlan", () => {
	it("accepts master and line plans and refuses others", () => {
		expect(() => assertOwnPlan(wirelessPlan, lines)).not.toThrow();
		expect(() => assertOwnPlan(fiberPlan, lines)).not.toThrow();
		expect(() => assertOwnPlan(resellerPlan, lines)).toThrow(
			/another dealer/,
		);
	});
});

describe("resolveNewSubscriberParent", () => {
	const customer = { dealerId: "johnnyh", dealerExternalId: "53853" };

	it("puts a line plan's subscriber under the line", () => {
		expect(resolveNewSubscriberParent(customer, fiberPlan, lines)).toBe(
			"84545",
		);
	});

	it("keeps the customer's dealer for a master plan", () => {
		expect(resolveNewSubscriberParent(customer, wirelessPlan, lines)).toBe(
			"53853",
		);
	});

	it("refuses a plan owned by a different dealer", () => {
		expect(() =>
			resolveNewSubscriberParent(customer, resellerPlan, lines),
		).toThrow(/different dealer/);
	});

	it("refuses a line plan for a customer outside the org's dealer", () => {
		expect(() =>
			resolveNewSubscriberParent(
				{ dealerId: "dotnet2", dealerExternalId: "60001" },
				fiberPlan,
				lines,
			),
		).toThrow(/LIBANCOM-FIBER/);
	});
});

describe("lineOfIRadiusParent", () => {
	it("reads the line, the master, and the sync's no-parent fallback", () => {
		expect(lineOfIRadiusParent("84545", lines)).toMatchObject({
			kind: "line",
			dealerId: "fiber",
		});
		expect(lineOfIRadiusParent("53853", lines)).toEqual({ kind: "master" });
		expect(lineOfIRadiusParent("1", lines)).toEqual({ kind: "master" });
		expect(lineOfIRadiusParent("0", lines)).toEqual({ kind: "master" });
		expect(lineOfIRadiusParent("60001", lines)).toEqual({
			kind: "foreign",
		});
	});
});

describe("assertCustomerStaysOnLine", () => {
	// Restored fiber subscriber whose local plan is still a johnnyh plan
	// (planId is conflict-tracked) while iRadius has them under 84545.
	const staleFiberCustomer = { externalId: "83999", plan: wirelessPlan };

	beforeEach(() => {
		getParentId.mockReset();
		findOrganization.mockReset();
		findOrganization.mockResolvedValue({
			activeDealer: lines.master,
			internalDealerLines: lines.lines,
		});
	});

	it("decides the line from iRadius, not the stale local plan", async () => {
		getParentId.mockResolvedValue("84545");
		await expect(
			assertCustomerStaysOnLine({
				organizationId: "abiroot",
				customer: staleFiberCustomer,
				newPlan: fiberPlan,
				readIRadius: true,
			}),
		).resolves.toBeUndefined();
		await expect(
			assertCustomerStaysOnLine({
				organizationId: "abiroot",
				customer: staleFiberCustomer,
				newPlan: wirelessPlan,
				readIRadius: true,
			}),
		).rejects.toThrow(/on the LIBANCOM-FIBER line/);
		expect(getParentId).toHaveBeenCalledWith("83999");
	});

	it("treats a customer with no local plan by their iRadius parent", async () => {
		getParentId.mockResolvedValue("84545");
		await expect(
			assertCustomerStaysOnLine({
				organizationId: "abiroot",
				customer: { externalId: "84050", plan: null },
				newPlan: fiberPlan,
				readIRadius: true,
			}),
		).resolves.toBeUndefined();
	});

	it("refuses when iRadius has the subscriber under another dealer", async () => {
		getParentId.mockResolvedValue("60001");
		await expect(
			assertCustomerStaysOnLine({
				organizationId: "abiroot",
				customer: { externalId: "1234", plan: wirelessPlan },
				newPlan: wirelessPlan,
				readIRadius: true,
			}),
		).rejects.toThrow(/another dealer \(#60001\)/);
	});

	it("falls back to the local plan when iRadius is not read", async () => {
		await expect(
			assertCustomerStaysOnLine({
				organizationId: "abiroot",
				customer: staleFiberCustomer,
				newPlan: fiberPlan,
				readIRadius: false,
			}),
		).rejects.toThrow(/LIBANCOM-FIBER/);
		expect(getParentId).not.toHaveBeenCalled();
	});

	it("falls back to the local plan when iRadius has no such user", async () => {
		getParentId.mockResolvedValue(null);
		await expect(
			assertCustomerStaysOnLine({
				organizationId: "abiroot",
				customer: staleFiberCustomer,
				newPlan: wirelessPlan,
				readIRadius: true,
			}),
		).resolves.toBeUndefined();
	});

	it("never reads iRadius for an org without internal lines", async () => {
		findOrganization.mockResolvedValue({
			activeDealer: lines.master,
			internalDealerLines: [],
		});
		await expect(
			assertCustomerStaysOnLine({
				organizationId: "dotnet2",
				customer: staleFiberCustomer,
				newPlan: resellerPlan,
				readIRadius: true,
			}),
		).resolves.toBeUndefined();
		expect(getParentId).not.toHaveBeenCalled();
	});
});
