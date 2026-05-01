import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
	verifyCustomerOwnership,
} from "@repo/api/lib/permission";
import {
	customerAudit,
	getAuditContextFromHeaders,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { iradiusSetActive } from "../lib/iradius-api";
import { mirrorToIRadius } from "../lib/iradius-mirror";

export const deleteCustomer = protectedProcedure
	.route({
		method: "POST",
		path: "/customers/delete",
		tags: ["Customers"],
		summary: "Deactivate a customer (set status to INACTIVE)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId, iradiusDisabled } =
			await requirePermission(
				input.organizationId,
				user.id,
				"customers",
				"delete",
			);

		const existing = await db.customer.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		await verifyCustomerOwnership(permCtx, "delete", existing.collectorId);

		// iRadius first — if it fails the local status is left untouched.
		await mirrorToIRadius({
			iradiusDisabled,
			logTag: "iRadius deactivate",
			failureMessage: "Failed to deactivate customer in iRadius",
			remote: () => iradiusSetActive(existing, false),
			local: () =>
				db.customer.update({
					where: { id: input.id },
					data: { status: "INACTIVE" },
				}),
		});

		const auditContext = getAuditContextFromHeaders(headers);
		customerAudit.deleted(
			input.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});
