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

export const updateServicePlan = protectedProcedure
	.route({
		method: "POST",
		path: "/service-plans/update",
		tags: ["Service Plans"],
		summary: "Update a service plan",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			name: z.string().min(1).max(100).optional(),
			description: z.string().max(500).optional(),
			downloadSpeed: z.number().int().min(1).optional(),
			uploadSpeed: z.number().int().min(1).optional(),
			monthlyPrice: z.number().min(0).optional(),
			// Worker custom-portal visibility. Empty array ⇒ visible to no one;
			// omitted ⇒ leave the current assignment unchanged.
			visibleWorkerIds: z.array(z.string()).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"servicePlans",
			"update",
		);

		const existing = await db.servicePlan.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Service plan not found",
			});
		}

		const updateData: Record<string, unknown> = {};
		if (input.name !== undefined) {
			updateData["name"] = input.name;
		}
		if (input.description !== undefined) {
			updateData["description"] = input.description ?? null;
		}
		if (input.downloadSpeed !== undefined) {
			updateData["downloadSpeed"] = input.downloadSpeed;
		}
		if (input.uploadSpeed !== undefined) {
			updateData["uploadSpeed"] = input.uploadSpeed;
		}
		if (input.monthlyPrice !== undefined) {
			updateData["monthlyPrice"] = input.monthlyPrice;
		}

		const plan = await db.servicePlan.update({
			where: { id: input.id },
			data: updateData,
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

		// Replace the worker-visibility set when provided. Empty array clears it
		// (plan becomes visible to all workers again).
		if (input.visibleWorkerIds !== undefined) {
			const workerIds = [...new Set(input.visibleWorkerIds)];
			await db.$transaction([
				db.servicePlanWorker.deleteMany({
					where: { servicePlanId: input.id },
				}),
				...(workerIds.length > 0
					? [
							db.servicePlanWorker.createMany({
								data: workerIds.map((employeeId) => ({
									servicePlanId: input.id,
									employeeId,
								})),
								skipDuplicates: true,
							}),
						]
					: []),
			]);
		}

		const auditContext = getAuditContextFromHeaders(headers);
		servicePlanAudit.updated(
			plan.id,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { plan };
	});
