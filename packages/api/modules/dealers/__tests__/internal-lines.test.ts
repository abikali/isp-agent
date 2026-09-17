import { describe, expect, it, vi } from "vitest";
import {
	assertOwnPlan,
	assertSamePlanLine,
	type OrgDealerLines,
	resolveNewSubscriberParent,
	resolvePlanLine,
} from "../lib/internal-lines";

vi.mock("@repo/database", () => ({ db: {} }));

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
