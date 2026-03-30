import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
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
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"customers",
			"update",
		);

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
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
