import { ORPCError } from "@orpc/server";
import { checkOrganizationMembership } from "@repo/api/lib/membership";
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
		const member = await checkOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Not a member of this organization",
			});
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
