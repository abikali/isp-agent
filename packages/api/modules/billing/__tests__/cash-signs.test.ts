import { describe, expect, it } from "vitest";
import {
	expenseDeductionAmount,
	handoffAmount,
	installationCostAmount,
	newUserSetupAmount,
} from "../lib/cash-signs";

/**
 * Balance everywhere is `Σ payments − Σ cashCollection.amount`, and the
 * legacy import preserves signed amounts: negative = cash the employee
 * received, positive = cash leaving their pocket. These helpers must
 * keep native rows on that convention.
 */
describe("cash-signs", () => {
	it("installation cost is negative (increases what the worker owes)", () => {
		expect(installationCostAmount(50)).toBe(-50);
		expect(installationCostAmount(-50)).toBe(-50);
	});

	it("new-user setup money is negative", () => {
		expect(newUserSetupAmount(120)).toBe(-120);
	});

	it("expense deduction is positive (reduces what the worker owes)", () => {
		expect(expenseDeductionAmount(30)).toBe(30);
		expect(expenseDeductionAmount(-30)).toBe(30);
	});

	it("handoff is positive", () => {
		expect(handoffAmount(200)).toBe(200);
	});

	it("balance math: worker collects install money then expenses part of it", () => {
		const payments = 100; // subscription cash collected
		const entries = [
			installationCostAmount(40), // collected 40 for hardware → -40
			expenseDeductionAmount(25), // spent 25, approved → +25
		];
		const balance = payments - entries.reduce((sum, a) => sum + a, 0);
		// owes 100 + 40 − 25 = 115
		expect(balance).toBe(115);
	});
});
