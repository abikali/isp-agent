import {
	getDealerScopeFilter,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Customer financial transactions derived from local data only:
 *   • Payment rows → credits
 *   • CustomerInvoice rows → debits
 *
 * The old `customer_transaction` table was a mirror of iRadius `UserBalance`
 * and has been retired now that invoice/payment data is fully local.
 */
export const listCustomerTransactions = protectedProcedure
	.route({
		method: "GET",
		path: "/customers/transactions",
		tags: ["Customers"],
		summary: "List financial transactions for a customer",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum(["operationDate", "credit", "debit"])
				.default("operationDate"),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		// Verify the user can access this customer (ownership check for :own scope)
		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { collectorId: true },
		});
		if (customer) {
			await verifyCustomerOwnership(
				permCtx,
				"read",
				customer.collectorId,
			);
		}

		const [payments, invoices] = await Promise.all([
			db.payment.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
				},
				select: {
					id: true,
					paidAmount: true,
					paidAt: true,
					notes: true,
					collector: { select: { name: true } },
					billingMonth: { select: { year: true, month: true } },
				},
			}),
			db.customerInvoice.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
					voidedAt: null,
				},
				select: {
					id: true,
					year: true,
					month: true,
					invoiceDate: true,
					total: true,
					totalWithTax: true,
				},
			}),
		]);

		interface TransactionRow {
			id: string;
			operationDate: Date;
			credit: number;
			debit: number;
			notes: string | null;
		}

		const rows: TransactionRow[] = [
			...payments.map((p) => ({
				id: `p_${p.id}`,
				operationDate: p.paidAt,
				credit: p.paidAmount,
				debit: 0,
				notes:
					p.notes ??
					[
						"Payment",
						p.collector?.name ? `by ${p.collector.name}` : null,
						`(${String(p.billingMonth.month).padStart(2, "0")}/${p.billingMonth.year})`,
					]
						.filter(Boolean)
						.join(" "),
			})),
			...invoices.map((inv) => ({
				id: `i_${inv.id}`,
				operationDate: inv.invoiceDate,
				credit: 0,
				debit: inv.totalWithTax > 0 ? inv.totalWithTax : inv.total,
				notes: `Invoice (${String(inv.month).padStart(2, "0")}/${inv.year})`,
			})),
		];

		const sortKey = input.sortBy;
		const dir = input.sortOrder === "asc" ? 1 : -1;
		rows.sort((a, b) => {
			const aVal =
				sortKey === "operationDate"
					? a.operationDate.getTime()
					: a[sortKey];
			const bVal =
				sortKey === "operationDate"
					? b.operationDate.getTime()
					: b[sortKey];
			if (aVal < bVal) {
				return -1 * dir;
			}
			if (aVal > bVal) {
				return 1 * dir;
			}
			return 0;
		});

		const total = rows.length;
		const skip = (input.page - 1) * input.pageSize;
		const transactions = rows.slice(skip, skip + input.pageSize);

		return {
			transactions,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
