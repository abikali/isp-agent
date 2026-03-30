import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import {
	getAuditContextFromHeaders,
	servicePlanAudit,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteServicePlan = protectedProcedure
	.route({
		method: "POST",
		path: "/service-plans/delete",
		tags: ["Service Plans"],
		summary: "Archive a service plan",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"servicePlans",
			"delete",
		);

		const existing = await db.servicePlan.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			include: {
				_count: {
					select: {
						customers: {
							where: { status: "ACTIVE" },
						},
					},
				},
			},
		});

		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Service plan not found",
			});
		}

		if (existing._count.customers > 0) {
			throw new ORPCError("CONFLICT", {
				message: `Cannot archive plan with ${existing._count.customers} active customer(s). Reassign them first.`,
			});
		}

		await db.servicePlan.update({
			where: { id: input.id },
			data: { archived: true },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		servicePlanAudit.deleted(
			input.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});
