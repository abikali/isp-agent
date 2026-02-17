import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const resetCustomerPin = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/{id}/pin/reset",
		tags: ["Customers"],
		summary: "Reset (remove) a customer's PIN",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const member = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "Only organization admins can reset customer PINs",
			});
		}

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
			},
			select: { id: true },
		});

		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		await db.customer.update({
			where: { id: input.customerId },
			data: { pin: null, pinHash: null },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.pinReset(
			input.customerId,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});
