import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import {
	getDealerScopeFilter,
	getPermissionContext,
	verifyPermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { iradiusSetActive } from "../../customers/lib/iradius-api";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";

export const stopAccount = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/payments/stop",
		tags: ["Billing"],
		summary: "Deactivate a customer account (mark as INACTIVE)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			customerId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const permCtx = getPermissionContext(
			user.id,
			input.organizationId,
			member.role,
			member.rolePermissions,
		);
		verifyPermission(permCtx, "billing", "collect");

		const activeDealerId = member.activeDealerId ?? null;

		const customer = await db.customer.findFirst({
			where: {
				id: input.customerId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
		});
		if (!customer) {
			throw new ORPCError("NOT_FOUND", {
				message: "Customer not found",
			});
		}

		await mirrorToIRadius({
			logTag: "iRadius stop account",
			failureMessage: "Failed to deactivate customer in iRadius",
			remote: () => iradiusSetActive(customer, false),
			local: () =>
				db.customer.update({
					where: { id: input.customerId },
					data: { status: "INACTIVE" },
				}),
		});

		return { success: true };
	});
