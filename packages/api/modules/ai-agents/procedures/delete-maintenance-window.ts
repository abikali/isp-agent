import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteMaintenanceWindow = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/maintenance-windows/{windowId}/delete",
		tags: ["AI Agents"],
		summary: "Delete a scheduled maintenance window",
	})
	.input(
		z.object({
			windowId: z.string(),
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"delete",
		);

		const existing = await db.aiMaintenanceWindow.findFirst({
			where: { id: input.windowId },
			include: { agent: { select: { organizationId: true } } },
		});
		if (
			!existing ||
			existing.agent.organizationId !== input.organizationId
		) {
			throw new ORPCError("NOT_FOUND", {
				message: "Maintenance window not found",
			});
		}

		await db.aiMaintenanceWindow.delete({ where: { id: input.windowId } });

		return { success: true };
	});
