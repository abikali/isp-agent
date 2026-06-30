import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getServicePlan = protectedProcedure
	.route({
		method: "GET",
		path: "/service-plans/{id}",
		tags: ["Service Plans"],
		summary: "Get a single service plan",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"servicePlans",
			"read",
		);

		const plan = await db.servicePlan.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			include: {
				_count: {
					select: { customers: true },
				},
				visibleWorkers: { select: { employeeId: true } },
			},
		});

		if (!plan) {
			throw new ORPCError("NOT_FOUND", {
				message: "Service plan not found",
			});
		}

		const { visibleWorkers, ...rest } = plan;
		return {
			plan: {
				...rest,
				visibleWorkerIds: visibleWorkers.map((w) => w.employeeId),
			},
		};
	});
