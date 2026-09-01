import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	coverageKey,
	fetchCoverageMap,
	invoiceAmount,
	monthRemaining,
	monthSettled,
} from "../lib/settlement";

/**
 * Fetch one invoice by id with customer + payment info.
 * Separate from the public `getInvoice` (which is a payment receipt view).
 */
export const getInvoiceDetail = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/invoices/{invoiceId}",
		tags: ["Billing"],
		summary: "Get invoice detail for admin view/edit",
	})
	.input(
		z.object({
			organizationId: z.string(),
			invoiceId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const invoice = await db.customerInvoice.findFirst({
			where: {
				id: input.invoiceId,
				organizationId: input.organizationId,
				customer: getDealerScopeFilter(activeDealerId),
			},
			select: {
				id: true,
				year: true,
				month: true,
				invoiceDate: true,
				expiryDate: true,
				accountPrice: true,
				iptvPrice: true,
				realIpPrice: true,
				total: true,
				discount: true,
				tax: true,
				totalWithTax: true,
				note: true,
				voidedAt: true,
				voidReason: true,
				createdAt: true,
				customer: {
					select: {
						id: true,
						accountNumber: true,
						firstName: true,
						lastName: true,
						username: true,
						mobile: true,
						phone: true,
						groupName: true,
						monthlyRate: true,
						plan: {
							select: {
								id: true,
								name: true,
								monthlyPrice: true,
							},
						},
					},
				},
				payments: {
					select: {
						id: true,
						paidAmount: true,
						discount: true,
						freeAccount: true,
						stoppedAccount: true,
						debtAccount: true,
						paidAt: true,
						collector: { select: { id: true, name: true } },
					},
					orderBy: { paidAt: "asc" },
				},
			},
		});

		if (!invoice) {
			throw new ORPCError("NOT_FOUND", { message: "Invoice not found" });
		}

		// Settlement is keyed on (customer, billing month) — see
		// lib/settlement.ts — so legacy payments with no invoice link still
		// count, and a stopped/debt row never paints the invoice paid.
		const billingMonth = await db.billingMonth.findFirst({
			where: {
				organizationId: input.organizationId,
				year: invoice.year,
				month: invoice.month,
			},
			select: { id: true },
		});
		const coverage = billingMonth
			? (
					await fetchCoverageMap(
						db,
						input.organizationId,
						[billingMonth.id],
						[invoice.customer.id],
					)
				).get(coverageKey(invoice.customer.id, billingMonth.id))
			: undefined;
		const amount = invoiceAmount(invoice);

		return {
			invoice: {
				...invoice,
				paid:
					monthSettled(amount, coverage) && invoice.voidedAt === null,
				paidTotal: coverage?.covered ?? 0,
				remaining: monthRemaining(amount, coverage),
			},
		};
	});
