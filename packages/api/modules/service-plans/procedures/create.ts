import { requirePermission } from "@repo/api/lib/permission";
import {
	getAuditContextFromHeaders,
	servicePlanAudit,
} from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const createServicePlan = protectedProcedure
	.route({
		method: "POST",
		path: "/service-plans",
		tags: ["Service Plans"],
		summary: "Create a new service plan",
	})
	.input(
		z.object({
			organizationId: z.string(),
			name: z.string().min(1).max(100),
			description: z.string().max(500).optional(),
			downloadSpeed: z.number().int().min(1),
			uploadSpeed: z.number().int().min(1),
			monthlyPrice: z.number().min(0),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"servicePlans",
			"create",
		);

		const plan = await db.servicePlan.create({
			data: {
				organizationId: input.organizationId,
				name: input.name,
				description: input.description ?? null,
				downloadSpeed: input.downloadSpeed,
				uploadSpeed: input.uploadSpeed,
				monthlyPrice: input.monthlyPrice,
			},
			select: {
				id: true,
				name: true,
				description: true,
				downloadSpeed: true,
				uploadSpeed: true,
				monthlyPrice: true,
				createdAt: true,
			},
		});

		const auditContext = getAuditContextFromHeaders(headers);
		servicePlanAudit.created(
			plan.id,
			user.id,
			input.organizationId,
			auditContext,
			{ name: input.name },
		);

		return { plan };
	});
