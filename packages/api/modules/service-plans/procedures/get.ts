import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
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
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const plan = await db.servicePlan.findFirst({
			where: {
				id: input.id,
				organizationId: input.organizationId,
			},
			include: {
				_count: {
					select: { customers: true },
				},
			},
		});

		if (!plan) {
			throw new ORPCError("NOT_FOUND", {
				message: "Service plan not found",
			});
		}

		return { plan };
	});
