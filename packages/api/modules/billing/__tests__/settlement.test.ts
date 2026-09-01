import { describe, expect, it } from "vitest";
import { allocatePaymentAcrossInvoices } from "../lib/calculations";
import {
	addCoverage,
	invoiceAmount,
	type MonthCoverage,
	monthRemaining,
	monthSettled,
} from "../lib/settlement";

/**
 * Regression cover for the 2026-09-01 partial-payment bug (reported by
 * Jhonny with test account `jhonnytest`): a customer owing 3 × $50 paid $10
 * and the system closed a full $50 invoice — the $40 vanished, the customer
 * dropped off the collect list, and a follow-up collection was refused as a
 * duplicate. Settlement is now the amount comparison tested here.
 */

/** Post-cutoff rows by default — the strict regime under test. */
function cover(
	rows: {
		paidAmount: number;
		discount?: number;
		freeAccount?: boolean;
		paidAt?: Date;
	}[],
): MonthCoverage | undefined {
	let acc: MonthCoverage | undefined;
	for (const r of rows) {
		acc = addCoverage(acc, {
			paidAmount: r.paidAmount,
			discount: r.discount ?? 0,
			freeAccount: r.freeAccount ?? false,
			paidAt: r.paidAt ?? new Date("2026-09-02T00:00:00Z"),
		});
	}
	return acc;
}

const LEGACY = new Date("2026-08-15T00:00:00Z");

describe("monthSettled / monthRemaining", () => {
	it("the jhonnytest case: $10 against a $50 invoice does NOT settle the month", () => {
		const coverage = cover([{ paidAmount: 10 }]);
		expect(monthSettled(50, coverage)).toBe(false);
		expect(monthRemaining(50, coverage)).toBe(40);
	});

	it("a month with no payments owes the full invoice", () => {
		expect(monthSettled(50, undefined)).toBe(false);
		expect(monthRemaining(50, undefined)).toBe(50);
	});

	it("full payment settles", () => {
		const coverage = cover([{ paidAmount: 50 }]);
		expect(monthSettled(50, coverage)).toBe(true);
		expect(monthRemaining(50, coverage)).toBe(0);
	});

	it("two partials that add up settle the month", () => {
		const coverage = cover([{ paidAmount: 10 }, { paidAmount: 40 }]);
		expect(monthSettled(50, coverage)).toBe(true);
		expect(monthRemaining(50, coverage)).toBe(0);
	});

	it("a doorstep discount counts toward coverage", () => {
		// Bill $50, collector waived $5 and took $45 — done, not $5 short.
		const coverage = cover([{ paidAmount: 45, discount: 5 }]);
		expect(monthSettled(50, coverage)).toBe(true);
	});

	it("a free waiver settles regardless of amount", () => {
		const coverage = cover([{ paidAmount: 0, freeAccount: true }]);
		expect(monthSettled(50, coverage)).toBe(true);
		expect(monthRemaining(50, coverage)).toBe(0);
	});

	it("tolerates 1-cent float noise without reopening a month", () => {
		const coverage = cover([{ paidAmount: 49.995 }]);
		expect(monthSettled(50, coverage)).toBe(true);
		expect(monthRemaining(50, coverage)).toBe(0);
	});

	it("an overpaid month (allocator folds change into it) owes nothing", () => {
		const coverage = cover([{ paidAmount: 60 }]);
		expect(monthSettled(50, coverage)).toBe(true);
		expect(monthRemaining(50, coverage)).toBe(0);
	});
});

describe("follow-up collection on a partially paid month", () => {
	it("allocates against remainders, so the $40 follow-up completes July", () => {
		// After the $10 partial, fetchCustomerUnpaidInvoices reports July
		// with amount = 40 (the remainder), then the untouched months.
		const owed = [
			{
				invoiceId: "jul",
				billingMonthId: "bm-jul",
				year: 2026,
				month: 7,
				amount: 40,
			},
			{
				invoiceId: "aug",
				billingMonthId: "bm-aug",
				year: 2026,
				month: 8,
				amount: 50,
			},
			{
				invoiceId: "sep",
				billingMonthId: "bm-sep",
				year: 2026,
				month: 9,
				amount: 50,
			},
		];

		const rows = allocatePaymentAcrossInvoices(40, owed);
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ invoiceId: "jul", amount: 40 });

		// July now carries $10 + $40 across two rows: settled.
		const julyCoverage = cover([{ paidAmount: 10 }, { paidAmount: 40 }]);
		expect(monthSettled(50, julyCoverage)).toBe(true);
	});

	it("a lump larger than the remainder spills into the next month", () => {
		const owed = [
			{
				invoiceId: "jul",
				billingMonthId: "bm-jul",
				year: 2026,
				month: 7,
				amount: 40,
			},
			{
				invoiceId: "aug",
				billingMonthId: "bm-aug",
				year: 2026,
				month: 8,
				amount: 50,
			},
		];
		const rows = allocatePaymentAcrossInvoices(60, owed);
		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({ invoiceId: "jul", amount: 40 });
		expect(rows[1]).toMatchObject({ invoiceId: "aug", amount: 20 });
	});
});

describe("legacy grandfather (LEGACY_SETTLEMENT_CUTOFF)", () => {
	it("keeps a pre-cutoff informal-price month settled — the Nadia Tabet case", () => {
		// $20 paid every month against a $25 invoice, all before the cutoff:
		// the old system settled those months and they must stay settled.
		const coverage = cover([{ paidAmount: 20, paidAt: LEGACY }]);
		expect(monthSettled(25, coverage)).toBe(true);
		expect(monthRemaining(25, coverage)).toBe(0);
	});

	it("a month with NO coverage stays unpaid regardless of era", () => {
		expect(monthSettled(25, undefined)).toBe(false);
	});

	it("post-cutoff partials are strict — the jhonnytest case stays open", () => {
		const coverage = cover([
			{ paidAmount: 10, paidAt: new Date("2026-09-01T15:05:00Z") },
		]);
		expect(monthSettled(50, coverage)).toBe(false);
		expect(monthRemaining(50, coverage)).toBe(40);
	});

	it("topping up a grandfathered month re-evaluates it strictly", () => {
		// $20 legacy + $5 new = $25: settled on the merits now.
		const coverage = cover([
			{ paidAmount: 20, paidAt: LEGACY },
			{ paidAmount: 5 },
		]);
		expect(monthSettled(25, coverage)).toBe(true);
		// $20 legacy + $2 new = $22: the new payment reopens the month with
		// the true remainder — collecting on it means finishing it.
		const short = cover([
			{ paidAmount: 20, paidAt: LEGACY },
			{ paidAmount: 2 },
		]);
		expect(monthSettled(25, short)).toBe(false);
		expect(monthRemaining(25, short)).toBe(3);
	});
});

describe("invoiceAmount", () => {
	it("prefers the tax-inclusive total when present", () => {
		expect(invoiceAmount({ total: 50, totalWithTax: 55 })).toBe(55);
		expect(invoiceAmount({ total: 50, totalWithTax: 0 })).toBe(50);
	});
});
