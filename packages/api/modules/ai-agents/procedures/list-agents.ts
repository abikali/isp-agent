import {
	getOwnershipFilterAsync,
	requirePermission,
} from "@repo/api/lib/permission";
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
		const { permCtx } = await requirePermission(
			organizationId,
			user.id,
			"aiAgents",
			"read",
		);

		const ownerFilter = await getOwnershipFilterAsync(
			permCtx,
			"aiAgents",
			"read",
		);

		const agents = await db.aiAgent.findMany({
			where: { organizationId, ...ownerFilter },
			select: {
				id: true,
				name: true,
				description: true,
				model: true,
				enabled: true,
				maintenanceMode: true,
				servicePlansEnabled: true,
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
