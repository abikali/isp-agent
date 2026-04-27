import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { getMonthDateRange } from "../lib/resolve-month";

/**
 * Manually create a customer_invoice row. Normally invoices are generated
 * at billing-month open; this covers edge cases (mid-month activation,
 * reactivations, adjustments) that the automated flow misses.
 */
export const createInvoice = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/invoices",
		tags: ["Billing"],
		summary: "Manually create an invoice",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
			year: z.number().int().min(2000).max(3000),
			month: z.number().int().min(1).max(12),
			accountPrice: z.number().finite().min(0).optional(),
			iptvPrice: z.number().finite().min(0).optional(),
			realIpPrice: z.number().finite().min(0).optional(),
			total: z.number().finite().min(0).optional(),
			discount: z.number().finite().min(0).default(0),
			tax: z.number().finite().min(0).default(0),
			totalWithTax: z.number().finite().min(0).optional(),
			expiryDate: z.string().optional(),
			note: z.string().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true, expiresAt: true },
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", { message: "Customer not found" });
		}

		const existing = await db.customerInvoice.findUnique({
			where: {
				organizationId_customerId_year_month: {
					organizationId: input.organizationId,
					customerId: input.customerId,
					year: input.year,
					month: input.month,
				},
			},
			select: { id: true },
		});
		if (existing) {
			throw new ORPCError("CONFLICT", {
				message: `Invoice for ${String(input.month).padStart(2, "0")}/${input.year} already exists for this customer`,
			});
		}

		const range = getMonthDateRange(input.year, input.month);
		const hasLineItems =
			input.accountPrice !== undefined ||
			input.iptvPrice !== undefined ||
			input.realIpPrice !== undefined;
		if (input.total === undefined && !hasLineItems) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Provide either total or line-item amounts",
			});
		}
		const lineItemTotal =
			(input.accountPrice ?? 0) +
			(input.iptvPrice ?? 0) +
			(input.realIpPrice ?? 0) -
			input.discount;
		const total = input.total ?? Math.max(0, lineItemTotal);
		const totalWithTax = input.totalWithTax ?? total + input.tax;
		const expiryDate = input.expiryDate
			? new Date(input.expiryDate)
			: (customer.expiresAt ?? range.lte);

		const invoice = await db.customerInvoice.create({
			data: {
				organizationId: input.organizationId,
				customerId: input.customerId,
				year: input.year,
				month: input.month,
				invoiceDate: range.gte,
				expiryDate,
				accountPrice: input.accountPrice ?? null,
				iptvPrice: input.iptvPrice ?? null,
				realIpPrice: input.realIpPrice ?? null,
				total,
				discount: input.discount,
				tax: input.tax,
				totalWithTax,
				note: input.note ?? null,
				paid: false,
			},
		});

		return { invoice };
	});
