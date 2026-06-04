import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

const WINDOW_SELECT = {
	id: true,
	startsAt: true,
	endsAt: true,
	message: true,
} as const;

export const createMaintenanceWindow = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/{agentId}/maintenance-windows",
		tags: ["AI Agents"],
		summary: "Schedule a maintenance window for an AI agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			startsAt: z.coerce.date(),
			endsAt: z.coerce.date(),
			message: z.string().min(1).max(2000),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"create",
		);

		if (input.endsAt <= input.startsAt) {
			throw new ORPCError("BAD_REQUEST", {
				message: "The end time must be after the start time",
			});
		}

		const agent = await db.aiAgent.findFirst({
			where: { id: input.agentId, organizationId: input.organizationId },
			select: { id: true },
		});
		if (!agent) {
			throw new ORPCError("NOT_FOUND", { message: "Agent not found" });
		}

		const window = await db.aiMaintenanceWindow.create({
			data: {
				agentId: input.agentId,
				startsAt: input.startsAt,
				endsAt: input.endsAt,
				message: input.message,
			},
			select: WINDOW_SELECT,
		});

		return { window };
	});
