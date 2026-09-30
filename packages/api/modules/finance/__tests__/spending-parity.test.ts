import { beforeEach, describe, expect, it, vi } from "vitest";

const { expenseFindMany, categoryFindMany, ruleFindMany } = vi.hoisted(() => ({
	expenseFindMany: vi.fn(),
	categoryFindMany: vi.fn(),
	ruleFindMany: vi.fn(),
}));

vi.mock("@repo/database", () => ({
	db: {
		expense: { findMany: expenseFindMany },
		financeCategory: { findMany: categoryFindMany },
		financeRule: { findMany: ruleFindMany },
	},
}));

import { foldLines } from "../lib/money-model";
import { classifyApprovedExpenses, fetchCostLines } from "../lib/queries";

/**
 * Spending said "Spent $79,665" while Money said "You spent $74,314" for the
 * same September: Spending summed every approved expense, including owner
 * draws and rows only a rule classifies as a draw. Both pages now read the
 * same classifier, so the two figures are one number.
 */
const period = {
	from: new Date("2026-09-01T00:00:00Z"),
	to: new Date("2026-10-01T00:00:00Z"),
};

beforeEach(() => {
	expenseFindMany.mockResolvedValue([
		{
			id: "e1",
			amount: 1000,
			description: "maintenance fee",
			financeCategoryId: "cost",
		},
		{ id: "e2", amount: 300, description: "fuel", financeCategoryId: null },
		// Explicitly a draw.
		{
			id: "e3",
			amount: 500,
			description: "owner",
			financeCategoryId: "draw",
		},
		// Uncategorised, but a rule says it is a draw.
		{
			id: "e4",
			amount: 200,
			description: "Jhonny personal",
			financeCategoryId: null,
		},
	]);
	categoryFindMany.mockResolvedValue([
		{ id: "cost", label: "Operations", kind: "COST" },
		{ id: "draw", label: "Owner draws", kind: "DRAW" },
	]);
	ruleFindMany.mockResolvedValue([
		{
			id: "r1",
			pattern: "personal",
			matchType: "contains",
			financeCategoryId: "draw",
			priority: 0,
		},
	]);
});

describe("Spending / Money parity", () => {
	it("spent is COST lines only, on both pages", async () => {
		const spending = foldLines(
			await classifyApprovedExpenses(
				"org",
				{ organizationId: "org" },
				period,
			),
		);
		const money = foldLines(
			await fetchCostLines(
				{ organizationId: "org", activeDealerId: "d1" },
				{ ...period, label: "Sep", months: [] } as never,
			),
		);
		expect(spending.cost).toBe(1300);
		expect(money.cost).toBe(spending.cost);
	});

	it("keeps draws — explicit and rule-classified — out of spent", async () => {
		const lines = await classifyApprovedExpenses(
			"org",
			{ organizationId: "org" },
			period,
		);
		expect(foldLines(lines).draws).toBe(700);
	});

	it("scopes the query with the caller's where plus approved-in-period", async () => {
		await classifyApprovedExpenses(
			"org",
			{ organizationId: "org", x: 1 },
			period,
		);
		expect(expenseFindMany).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					AND: [
						{ organizationId: "org", x: 1 },
						{
							status: "APPROVED",
							createdAt: { gte: period.from, lt: period.to },
						},
					],
				},
			}),
		);
	});
});
