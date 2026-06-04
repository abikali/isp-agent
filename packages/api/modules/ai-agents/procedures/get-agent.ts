import { ORPCError } from "@orpc/server";
import { requirePermission, verifyPermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getAgent = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/{agentId}",
		tags: ["AI Agents"],
		summary: "Get AI agent details",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);

		const agent = await db.aiAgent.findFirst({
			where: {
				id: input.agentId,
				organizationId: input.organizationId,
			},
			select: {
				id: true,
				name: true,
				description: true,
				systemPrompt: true,
				greetingMessage: true,
				model: true,
				knowledgeBase: true,
				enabled: true,
				maintenanceMode: true,
				maintenanceMessage: true,
				maxHistoryLength: true,
				temperature: true,
				enabledTools: true,
				servicePlansEnabled: true,
				servicePlanIds: true,
				contextGapThresholdMinutes: true,
				humanTakeoverHours: true,
				promptSections: true,
				webChatEnabled: true,
				webChatToken: true,
				createdAt: true,
				updatedAt: true,
				createdBy: {
					select: {
						id: true,
						name: true,
						email: true,
					},
				},
				toolConfigs: {
					select: {
						id: true,
						toolId: true,
						config: true,
						promptSection: true,
					},
				},
				channels: {
					select: {
						id: true,
						provider: true,
						name: true,
						webhookToken: true,
						enabled: true,
						lastActivityAt: true,
						createdAt: true,
					},
					orderBy: { createdAt: "desc" },
				},
				maintenanceWindows: {
					select: {
						id: true,
						startsAt: true,
						endsAt: true,
						message: true,
					},
					orderBy: { startsAt: "desc" },
					take: 50,
				},
				_count: {
					select: {
						conversations: true,
					},
				},
			},
		});

		if (!agent) {
			throw new ORPCError("NOT_FOUND", {
				message: "Agent not found",
			});
		}

		verifyPermission(permCtx, "aiAgents", "read", {
			resourceCreatedById: agent.createdBy?.id ?? null,
		});

		// Effective maintenance: manual toggle OR a window active right now.
		const now = new Date();
		const maintenanceActive =
			agent.maintenanceMode ||
			agent.maintenanceWindows.some(
				(w) => w.startsAt <= now && now < w.endsAt,
			);

		return { agent: { ...agent, maintenanceActive } };
	});
