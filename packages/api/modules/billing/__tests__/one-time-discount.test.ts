import { describe, expect, it, vi } from "vitest";
import {
	applyOneTimeDiscount,
	OneTimeDiscountError,
	oneTimeDiscountUpdate,
} from "../lib/one-time-discount";

const invoice = {
	total: 30,
	discount: 0,
	tax: 0,
	note: null,
	voidedAt: null,
};

describe("oneTimeDiscountUpdate", () => {
	it("lowers the total, raises the discount and records why (lebnenhadchite)", () => {
		expect(
			oneTimeDiscountUpdate(invoice, {
				amount: 10,
				reason: "ابراهيم",
				userName: "Jhonny",
			}),
		).toEqual({
			discount: 10,
			total: 20,
			totalWithTax: 20,
			note: "One-time discount −$10 (this month only): ابراهيم — Jhonny",
		});
	});

	it("keeps the standing discount and appends to an existing note", () => {
		const out = oneTimeDiscountUpdate(
			{ ...invoice, total: 25, discount: 5, tax: 1, note: "manual" },
			{ amount: 5, reason: "outage", userName: "A" },
		);
		expect(out.discount).toBe(10);
		expect(out.total).toBe(20);
		expect(out.totalWithTax).toBe(21);
		expect(out.note).toBe(
			"manual · One-time discount −$5 (this month only): outage — A",
		);
	});

	it("refuses more than the total, zero, and voided invoices", () => {
		const p = { reason: "x", userName: "A" };
		expect(() =>
			oneTimeDiscountUpdate(invoice, { ...p, amount: 31 }),
		).toThrow(OneTimeDiscountError);
		expect(() =>
			oneTimeDiscountUpdate(invoice, { ...p, amount: 0 }),
		).toThrow(OneTimeDiscountError);
		expect(() =>
			oneTimeDiscountUpdate(
				{ ...invoice, voidedAt: new Date() },
				{ ...p, amount: 5 },
			),
		).toThrow(OneTimeDiscountError);
	});

	it("allows discounting the whole invoice", () => {
		expect(
			oneTimeDiscountUpdate(invoice, {
				amount: 30,
				reason: "gift",
				userName: "A",
			}).total,
		).toBe(0);
	});
});

describe("applyOneTimeDiscount", () => {
	it("writes only the invoice — never the customer", async () => {
		const update = vi.fn();
		const customerUpdate = vi.fn();
		const tx = {
			customerInvoice: {
				findUnique: vi.fn().mockResolvedValue(invoice),
				update,
			},
			customer: { update: customerUpdate },
		};
		const result = await applyOneTimeDiscount(tx as never, {
			invoiceId: "inv1",
			amount: 10,
			reason: "once",
			userName: "A",
		});
		expect(result).toEqual({ oldTotal: 30, total: 20, totalWithTax: 20 });
		expect(update).toHaveBeenCalledWith({
			where: { id: "inv1" },
			data: expect.objectContaining({ total: 20, discount: 10 }),
		});
		expect(customerUpdate).not.toHaveBeenCalled();
	});
});
