import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	findUniqueConversation,
	findUniqueCustomer,
	findManyInvoices,
	findManyMonths,
	findManyPayments,
} = vi.hoisted(() => ({
	findUniqueConversation: vi.fn(),
	findUniqueCustomer: vi.fn(),
	findManyInvoices: vi.fn(),
	findManyMonths: vi.fn(),
	findManyPayments: vi.fn(),
}));

vi.mock("@repo/database", () => {
	return {
		db: {
			aiConversation: { findUnique: findUniqueConversation },
			customer: { findUnique: findUniqueCustomer },
			customerInvoice: { findMany: findManyInvoices },
			billingMonth: { findMany: findManyMonths },
			payment: { findMany: findManyPayments },
		},
	};
});
vi.mock("@repo/logs", () => ({ logger: { error: vi.fn(), info: vi.fn() } }));

import { ispListInvoices } from "../isp-list-invoices";

const context = {
	organizationId: "org",
	agentId: "agent",
	credentials: { provider: "openrouter", apiKey: "test" } as const,
	conversationId: "conv",
	externalChatId: "x",
};

function run(input: { months?: number } = {}) {
	const t = ispListInvoices.factory(context);
	return (t as any).execute(input, { toolCallId: "t", messages: [] });
}

describe("isp-list-invoices", () => {
	beforeEach(() => {
		vi.stubEnv("SITE_URL", "https://cp.libancomlb.com");
		vi.clearAllMocks();
	});

	it("refuses when the conversation is not verified", async () => {
		findUniqueConversation.mockResolvedValue({ verifiedCustomerId: null });
		const out = await run();
		expect(out.success).toBe(false);
		expect(out.verified).toBe(false);
		expect(out.message).toMatch(/phone number/);
	});

	it("derives paid / partial / unpaid with settlement rules and links receipts", async () => {
		findUniqueConversation.mockResolvedValue({ verifiedCustomerId: "c1" });
		findUniqueCustomer.mockResolvedValue({
			firstName: "Ali",
			lastName: "Ghossein",
			username: "alighossein",
		});
		findManyInvoices.mockResolvedValue([
			{
				id: "i9",
				year: 2026,
				month: 9,
				total: 50,
				totalWithTax: 0,
				expiryDate: new Date("2026-10-03"),
			},
			{
				id: "i8",
				year: 2026,
				month: 8,
				total: 50,
				totalWithTax: 0,
				expiryDate: new Date("2026-09-03"),
			},
			{
				id: "i7",
				year: 2026,
				month: 7,
				total: 50,
				totalWithTax: 0,
				expiryDate: new Date("2026-08-03"),
			},
		]);
		findManyMonths.mockResolvedValue([
			{ id: "m9", year: 2026, month: 9 },
			{ id: "m8", year: 2026, month: 8 },
			{ id: "m7", year: 2026, month: 7 },
		]);
		findManyPayments.mockResolvedValue([
			// September: $10 of $50 after the cutoff → partial
			{
				id: "p9",
				billingMonthId: "m9",
				invoiceId: "i9",
				paidAmount: 10,
				discount: 0,
				freeAccount: false,
				paidAt: new Date("2026-09-05"),
			},
			// August: full
			{
				id: "p8",
				billingMonthId: "m8",
				invoiceId: null,
				paidAmount: 50,
				discount: 0,
				freeAccount: false,
				paidAt: new Date("2026-08-04"),
			},
		]);
		const out = await run({ months: 3 });
		expect(out.success).toBe(true);
		expect(out.customer.username).toBe("alighossein");
		expect(
			out.invoices.map((i: { month: string; status: string }) => [
				i.month,
				i.status,
			]),
		).toEqual([
			["2026-09", "partial"],
			["2026-08", "paid"],
			["2026-07", "unpaid"],
		]);
		expect(out.invoices[0].remaining).toBe(40);
		expect(out.invoices[0].receiptUrl).toBe(
			"https://cp.libancomlb.com/invoice/p9",
		);
		expect(out.invoices[1].receiptUrl).toBe(
			"https://cp.libancomlb.com/invoice/p8",
		);
		expect(out.invoices[2].receiptUrl).toBeUndefined();
		expect(out.summary).toEqual({ unpaidCount: 2, totalDue: 90 });
	});
});
