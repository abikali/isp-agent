import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"read",
		);

		const [transactions, total] = await Promise.all([
			db.customerTransaction.findMany({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
				},
				orderBy: { operationDate: "desc" },
				skip: (input.page - 1) * input.pageSize,
				take: input.pageSize,
			}),
			db.customerTransaction.count({
				where: {
					organizationId: input.organizationId,
					customerId: input.customerId,
				},
			}),
		]);

		return {
			transactions,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
