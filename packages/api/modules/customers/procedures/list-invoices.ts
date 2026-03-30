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

		const [invoices, total] = await Promise.all([
			db.customerInvoice.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
				},
				orderBy: { invoiceDate: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.customerInvoice.count({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
				},
			}),
		]);

		return {
			invoices,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
