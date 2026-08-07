import { describe, expect, it } from "vitest";
import {
	allocatePaymentAcrossInvoices,
	type UnpaidInvoiceRow,
} from "../lib/calculations";

/**
 * A lump collection covering several owed months must settle each month, not
 * just the active one (the bug: $160 for two $80 months cleared only one). The
 * allocation is FIFO — oldest invoice first — and always sums to exactly the
 * amount paid so collector cash totals stay intact.
 */
function inv(
	year: number,
	month: number,
	amount: number,
	id = `${year}-${month}`,
): UnpaidInvoiceRow {
	return { invoiceId: id, billingMonthId: `bm-${id}`, year, month, amount };
}

function sum(rows: { amount: number }[]): number {
	return rows.reduce((s, r) => s + r.amount, 0);
}

describe("allocatePaymentAcrossInvoices", () => {
	it("splits a two-month lump into one settled row per month", () => {
		const rows = allocatePaymentAcrossInvoices(160, [
			inv(2026, 5, 80),
			inv(2026, 6, 80),
		]);
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.amount)).toEqual([80, 80]);
		expect(sum(rows)).toBe(160);
	});

	it("settles the oldest invoice first when the money covers only one month", () => {
		const rows = allocatePaymentAcrossInvoices(80, [
			inv(2026, 5, 80),
			inv(2026, 6, 80),
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.invoiceId).toBe("2026-5");
		expect(sum(rows)).toBe(80);
	});

	it("leaves newer months unpaid when only the oldest can be covered", () => {
		const rows = allocatePaymentAcrossInvoices(160, [
			inv(2026, 4, 80),
			inv(2026, 5, 80),
			inv(2026, 6, 80),
		]);
		expect(rows.map((r) => r.invoiceId)).toEqual(["2026-4", "2026-5"]);
	});

	it("folds an overpayment beyond every owed month into the last row", () => {
		const rows = allocatePaymentAcrossInvoices(200, [
			inv(2026, 5, 80),
			inv(2026, 6, 80),
		]);
		expect(rows.map((r) => r.amount)).toEqual([80, 120]);
		expect(sum(rows)).toBe(200);
	});

	it("records an underpayment as a single partial row on the oldest month", () => {
		const rows = allocatePaymentAcrossInvoices(50, [inv(2026, 6, 80)]);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.amount).toBe(50);
	});

	it("returns nothing when there is nothing owed", () => {
		expect(allocatePaymentAcrossInvoices(160, [])).toEqual([]);
	});

	it("always sums to the amount paid across varied invoice totals", () => {
		const rows = allocatePaymentAcrossInvoices(175.5, [
			inv(2026, 4, 60),
			inv(2026, 5, 60.5),
			inv(2026, 6, 60),
		]);
		expect(sum(rows)).toBeCloseTo(175.5, 5);
	});

	describe("coverAllInvoices (free settlements)", () => {
		it("emits a zero-amount row for every owed month", () => {
			const rows = allocatePaymentAcrossInvoices(
				0,
				[inv(2026, 5, 25), inv(2026, 6, 25), inv(2026, 7, 25)],
				{ coverAllInvoices: true },
			);
			expect(rows).toHaveLength(3);
			expect(rows.map((r) => r.amount)).toEqual([0, 0, 0]);
		});

		it("covers months past the cash instead of stranding them", () => {
			// The eliastrad case: 2 months still owed after a cash split, free
			// must waive both — not leapfrog to the newest one.
			const rows = allocatePaymentAcrossInvoices(
				0,
				[inv(2026, 7, 25), inv(2026, 8, 25)],
				{ coverAllInvoices: true },
			);
			expect(rows.map((r) => r.invoiceId)).toEqual(["2026-7", "2026-8"]);
		});

		it("still FIFO-allocates addon money and sums to the amount paid", () => {
			const rows = allocatePaymentAcrossInvoices(
				30,
				[inv(2026, 6, 25), inv(2026, 7, 25), inv(2026, 8, 25)],
				{ coverAllInvoices: true },
			);
			expect(rows).toHaveLength(3);
			expect(rows.map((r) => r.amount)).toEqual([25, 5, 0]);
			expect(sum(rows)).toBe(30);
		});
	});
});
