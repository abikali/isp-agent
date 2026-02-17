import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listServicePlans = protectedProcedure
	.route({
		method: "GET",
		path: "/service-plans",
		tags: ["Service Plans"],
		summary: "List service plans for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
			includeArchived: z.boolean().default(false),
		}),
	)
	.handler(
		async ({
			context: { user },
			input: { organizationId, includeArchived },
		}) => {
			const member = await verifyOrganizationMembership(
				organizationId,
				user.id,
			);
			if (!member) {
				throw new ORPCError("FORBIDDEN", {
					message: "You must be a member of this organization",
				});
			}

			const where: Record<string, unknown> = { organizationId };
			if (!includeArchived) {
				where["archived"] = false;
			}

			const plans = await db.servicePlan.findMany({
				where,
				select: {
					id: true,
					name: true,
					description: true,
					downloadSpeed: true,
					uploadSpeed: true,
					monthlyPrice: true,
					archived: true,
					createdAt: true,
					_count: {
						select: { customers: true },
					},
				},
				orderBy: { createdAt: "desc" },
			});

			return { plans };
		},
	);
