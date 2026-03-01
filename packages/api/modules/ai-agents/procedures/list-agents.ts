import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listAgents = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents",
		tags: ["AI Agents"],
		summary: "List AI agents for an organization",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input: { organizationId } }) => {
		const member = await verifyOrganizationMembership(
			organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const agents = await db.aiAgent.findMany({
			where: { organizationId },
			select: {
				id: true,
				name: true,
				description: true,
				model: true,
				enabled: true,
				maintenanceMode: true,
				createdAt: true,
				_count: {
					select: {
						channels: true,
						conversations: true,
					},
				},
			},
			orderBy: { createdAt: "desc" },
		});

		return { agents };
	});
