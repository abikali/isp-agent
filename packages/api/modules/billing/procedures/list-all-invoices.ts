import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * Org-wide invoice list with filters, search, sort, pagination.
 * Mirrors the shape of list-payments for consistency with the UI.
 */
export const listAllInvoices = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/invoices",
		tags: ["Billing"],
		summary: "List all invoices (org-wide) with filters",
	})
	.input(
		z.object({
			organizationId: z.string(),
			year: z.number().int().optional(),
			month: z.number().int().min(1).max(12).optional(),
			search: z.string().optional(),
			status: z.enum(["all", "paid", "unpaid", "voided"]).default("all"),
			page: z.number().int().min(1).default(1),
			pageSize: z.number().int().min(10).max(100).default(25),
			sortBy: z
				.enum([
					"invoiceDate",
					"total",
					"totalWithTax",
					"paid",
					"expiryDate",
				])
				.default("invoiceDate"),
			sortOrder: z.enum(["asc", "desc"]).default("desc"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const where: Record<string, unknown> = {
			organizationId: input.organizationId,
		};
		if (input.year !== undefined) {
			where["year"] = input.year;
		}
		if (input.month !== undefined) {
			where["month"] = input.month;
		}

		const customerFilter: Record<string, unknown> = {
			...getDealerScopeFilter(activeDealerId),
		};
		if (input.search) {
			customerFilter["OR"] = [
				{
					firstName: {
						contains: input.search,
						mode: "insensitive" as const,
					},
				},
				{
					lastName: {
						contains: input.search,
						mode: "insensitive" as const,
					},
				},
				{
					username: {
						contains: input.search,
						mode: "insensitive" as const,
					},
				},
				{
					mobile: {
						contains: input.search,
						mode: "insensitive" as const,
					},
				},
				{
					accountNumber: {
						contains: input.search,
						mode: "insensitive" as const,
					},
				},
			];
		}
		if (Object.keys(customerFilter).length > 0) {
			where["customer"] = customerFilter;
		}

		if (input.status === "paid") {
			where["payment"] = { is: {} };
			where["voidedAt"] = null;
		} else if (input.status === "unpaid") {
			where["payment"] = { is: null };
			where["voidedAt"] = null;
		} else if (input.status === "voided") {
			where["voidedAt"] = { not: null };
		}

		const [invoices, total] = await Promise.all([
			db.customerInvoice.findMany({
				where,
				select: {
					id: true,
					year: true,
					month: true,
					invoiceDate: true,
					expiryDate: true,
					total: true,
					discount: true,
					tax: true,
					totalWithTax: true,
					paid: true,
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
						},
					},
					payment: {
						select: {
							id: true,
							paidAmount: true,
							paidAt: true,
							collector: { select: { id: true, name: true } },
						},
					},
				},
				orderBy: { [input.sortBy]: input.sortOrder },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.customerInvoice.count({ where }),
		]);

		return {
			invoices,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
