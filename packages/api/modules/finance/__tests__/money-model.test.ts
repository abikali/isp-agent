import { describe, expect, it } from "vitest";
import {
	detectRecurringLines,
	matchRule,
	normaliseDescription,
} from "../lib/classify";
import { foldLines, kindOfCashType } from "../lib/money-model";
import { periodProgress, previousPeriod, resolvePeriod } from "../lib/period";

describe("kindOfCashType", () => {
	it("treats the expense mirror row as a transfer, never a cost", () => {
		// The old net total summed EXPENSE_DEDUCTION into "handed off" as a
		// positive AND subtracted the same expenses, cancelling them to zero.
		expect(kindOfCashType("EXPENSE_DEDUCTION")).toBe("TRANSFER");
	});

	it("treats handoffs as transfers so retail revenue is not double counted", () => {
		expect(kindOfCashType("HANDOFF")).toBe("TRANSFER");
	});

	it("counts a store purchase as revenue", () => {
		expect(kindOfCashType("STORE_PURCHASE")).toBe("REVENUE");
	});

	it("defaults unknown types to transfer rather than inventing revenue", () => {
		expect(kindOfCashType("SOMETHING_NEW")).toBe("TRANSFER");
	});
});

describe("foldLines", () => {
	it("reproduces July 2026 from the production audit", () => {
		const result = foldLines([
			{
				kind: "REVENUE",
				label: "Subscribers",
				amount: 58903,
				stream: "RETAIL",
			},
			{
				kind: "REVENUE",
				label: "Dealers",
				amount: 54699,
				stream: "WHOLESALE",
			},
			{ kind: "COST", label: "Internet we buy", amount: 59383 },
			{ kind: "COST", label: "Staff pay", amount: 11319 },
			{ kind: "COST", label: "Other running costs", amount: 7595 },
			{ kind: "COST", label: "Rent & office", amount: 13200 },
		]);

		expect(result.revenue).toBe(113602);
		expect(result.cost).toBe(91497);
		expect(result.net).toBe(22105);
		expect(result.byStream.RETAIL).toBe(58903);
		expect(result.byStream.WHOLESALE).toBe(54699);
	});

	it("keeps owner draws out of operating profit but inside net", () => {
		const result = foldLines([
			{
				kind: "REVENUE",
				label: "Subscribers",
				amount: 100,
				stream: "RETAIL",
			},
			{ kind: "COST", label: "Internet we buy", amount: 40 },
			{ kind: "DRAW", label: "My own money", amount: 30 },
		]);

		expect(result.operatingProfit).toBe(60);
		expect(result.net).toBe(30);
		expect(result.draws).toBe(30);
	});

	it("ignores transfers entirely", () => {
		const withTransfers = foldLines([
			{
				kind: "REVENUE",
				label: "Subscribers",
				amount: 100,
				stream: "RETAIL",
			},
			{ kind: "TRANSFER", label: "Handoff", amount: 5000 },
			{ kind: "TRANSFER", label: "Cash float", amount: -9000 },
		]);

		expect(withTransfers.net).toBe(100);
	});
});

describe("normaliseDescription", () => {
	it("collapses spelling and amount variants onto one key", () => {
		const a = normaliseDescription("Energy bridge");
		expect(normaliseDescription("energy bridge  ")).toBe(a);
		expect(normaliseDescription("Energy Bridge 2290$")).toBe(a);
	});

	it("leaves Arabic intact", () => {
		expect(normaliseDescription("اجار المكتب 6 شهور")).toBe(
			"اجار المكتب شهور",
		);
	});
});

describe("matchRule", () => {
	const rules = [
		{
			id: "broad",
			pattern: "energy",
			matchType: "contains",
			financeCategoryId: "cat-network",
			priority: 0,
		},
		{
			id: "specific",
			pattern: "energy bridge taskir",
			matchType: "contains",
			financeCategoryId: "cat-other",
			priority: 0,
		},
	];

	it("prefers the more specific pattern on a tie", () => {
		expect(matchRule("Energy bridge taskir", rules)?.id).toBe("specific");
	});

	it("falls back to the broad pattern", () => {
		expect(matchRule("Energy bridge", rules)?.id).toBe("broad");
	});

	it("returns null when nothing matches", () => {
		expect(matchRule("Battery 100Ah", rules)).toBeNull();
	});
});

describe("detectRecurringLines", () => {
	const d = (iso: string) => new Date(iso);

	it("surfaces a standing monthly commitment", () => {
		const lines = detectRecurringLines([
			{
				description: "Wasil l chady",
				amount: 13200,
				createdAt: d("2026-05-11"),
				financeCategoryId: null,
			},
			{
				description: "Wasil l chady",
				amount: 14400,
				createdAt: d("2026-06-11"),
				financeCategoryId: null,
			},
			{
				description: "Wasil l chady",
				amount: 13200,
				createdAt: d("2026-07-09"),
				financeCategoryId: null,
			},
		]);

		expect(lines).toHaveLength(1);
		expect(lines[0]?.monthsSeen).toBe(3);
		expect(lines[0]?.monthlyAverage).toBeCloseTo(13600, 0);
	});

	it("surfaces a single large payment even though it never repeats", () => {
		const lines = detectRecurringLines([
			{
				description: "Ziad salloum",
				amount: 10000,
				createdAt: d("2026-05-14"),
				financeCategoryId: null,
			},
		]);
		expect(lines.map((l) => l.label)).toContain("Ziad salloum");
	});

	it("ignores small one-offs so the wizard stays short", () => {
		const lines = detectRecurringLines([
			{
				description: "patch cord",
				amount: 6,
				createdAt: d("2026-06-22"),
				financeCategoryId: null,
			},
		]);
		expect(lines).toHaveLength(0);
	});

	it("ranks by total spend, because that is what a wrong answer costs", () => {
		const lines = detectRecurringLines([
			{
				description: "Wasil l chady",
				amount: 13200,
				createdAt: d("2026-07-09"),
				financeCategoryId: null,
			},
			{
				description: "Energy bridge",
				amount: 52400,
				createdAt: d("2026-08-20"),
				financeCategoryId: null,
			},
		]);
		expect(lines[0]?.label).toBe("Energy bridge");
	});
});

describe("period", () => {
	const now = new Date("2026-08-26T10:00:00Z");

	it("resolves the current calendar month", () => {
		const p = resolvePeriod("this-month", now);
		expect(p.label).toBe("August 2026");
		expect(p.months).toEqual([{ year: 2026, month: 8 }]);
	});

	it("uses an exclusive end so the last second of the month is included", () => {
		const p = resolvePeriod("this-month", now);
		expect(p.to.toISOString()).toBe("2026-09-01T00:00:00.000Z");
	});

	it("steps back a whole period of the same length", () => {
		const prior = previousPeriod(resolvePeriod("last-3", now));
		expect(prior.months).toEqual([
			{ year: 2026, month: 3 },
			{ year: 2026, month: 4 },
			{ year: 2026, month: 5 },
		]);
	});

	it("reports a part-month as partial so the UI never implies a collapse", () => {
		const p = resolvePeriod("this-month", now);
		const progress = periodProgress(p, now);
		expect(progress).toBeGreaterThan(0.7);
		expect(progress).toBeLessThan(0.9);
	});

	it("crosses a year boundary correctly", () => {
		const p = resolvePeriod("last-month", new Date("2026-01-14T00:00:00Z"));
		expect(p.label).toBe("December 2025");
	});
});
