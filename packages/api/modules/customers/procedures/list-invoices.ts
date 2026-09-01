import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	addCoverage,
	invoiceAmount,
	type MonthCoverage,
	monthRemaining,
	monthSettled,
} from "../../billing/lib/settlement";

export const listCustomerInvoices = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/invoices",
		tags: ["Customers"],
		summary: "List invoices for a customer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum(["invoiceDate", "total", "totalWithTax", "paid"])
				.optional(),
			sortOrder: z.enum(["asc", "desc"]).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { collectorId: true },
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}
		await verifyCustomerOwnership(permCtx, "read", customer.collectorId);

		const sortOrder = input.sortOrder ?? "desc";

		// One customer's history is tiny (a handful of months), so fetch it
		// whole, settle in JS, and paginate in memory. Settlement is keyed on
		// (customer, billing month) — see billing/lib/settlement.ts — so a
		// legacy payment with no invoice link still marks its month paid, and
		// a $10 partial against a $50 invoice shows Partial, not Paid.
		const CUSTOMER_INVOICE_CAP = 500;
		const [allInvoices, billingMonths, paymentRows] = await Promise.all([
			db.customerInvoice.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
				},
				take: CUSTOMER_INVOICE_CAP,
				select: {
					id: true,
					year: true,
					month: true,
					invoiceDate: true,
					expiryDate: true,
					total: true,
					tax: true,
					totalWithTax: true,
					voidedAt: true,
					payments: { select: { id: true }, take: 1 },
				},
			}),
			db.billingMonth.findMany({
				where: { organizationId: input.organizationId },
				select: { id: true, year: true, month: true },
			}),
			db.payment.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
				},
				select: {
					billingMonthId: true,
					paidAmount: true,
					discount: true,
					freeAccount: true,
					paidAt: true,
					stoppedAccount: true,
					debtAccount: true,
				},
			}),
		]);
		const monthIdByYM = new Map(
			billingMonths.map((m) => [`${m.year}-${m.month}`, m.id]),
		);
		const coverageByMonthId = new Map<string, MonthCoverage>();
		const stoppedMonthIds = new Set<string>();
		for (const row of paymentRows) {
			if (row.stoppedAccount) {
				stoppedMonthIds.add(row.billingMonthId);
				continue;
			}
			if (row.debtAccount) {
				continue;
			}
			coverageByMonthId.set(
				row.billingMonthId,
				addCoverage(coverageByMonthId.get(row.billingMonthId), row),
			);
		}

		const settled = allInvoices.map(({ payments, ...invoice }) => {
			const monthId = monthIdByYM.get(`${invoice.year}-${invoice.month}`);
			const amount = invoiceAmount(invoice);
			const coverage = monthId
				? coverageByMonthId.get(monthId)
				: undefined;
			const remaining = monthRemaining(amount, coverage);
			return {
				...invoice,
				paid:
					invoice.voidedAt === null && monthSettled(amount, coverage),
				paidTotal: coverage?.covered ?? 0,
				remaining,
				// Collector reported the customer stopped ($0 stop-flag row).
				stopped: monthId ? stoppedMonthIds.has(monthId) : false,
				// Any linked payment blocks deletion (see deleteInvoice).
				hasPayment: payments.length > 0,
			};
		});

		const dir = sortOrder === "asc" ? 1 : -1;
		const sortBy = input.sortBy ?? "invoiceDate";
		settled.sort((a, b) => {
			if (sortBy === "paid") {
				return (Number(a.paid) - Number(b.paid)) * dir;
			}
			if (sortBy === "invoiceDate") {
				return (
					(a.invoiceDate.getTime() - b.invoiceDate.getTime()) * dir
				);
			}
			if (sortBy === "total") {
				return (a.total - b.total) * dir;
			}
			return (a.totalWithTax - b.totalWithTax) * dir;
		});

		const total = settled.length;
		const start = (input.page - 1) * input.pageSize;

		return {
			invoices: settled.slice(start, start + input.pageSize),
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
