import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
		// "paid" is a derived status (no column) — sort by the linked payment's
		// timestamp so paid vs unpaid invoices group together.
		const orderBy =
			input.sortBy === "paid"
				? { payment: { paidAt: sortOrder } }
				: { [input.sortBy ?? "invoiceDate"]: sortOrder };

		const [invoices, total] = await Promise.all([
			db.customerInvoice.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
				},
				orderBy,
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
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
					payment: { select: { id: true } },
				},
			}),
			db.customerInvoice.count({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
				},
			}),
		]);

		return {
			invoices: invoices.map(({ payment, ...invoice }) => ({
				...invoice,
				// Paid ⟺ a non-voided payment exists (single source of truth).
				paid: payment !== null && invoice.voidedAt === null,
			})),
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
