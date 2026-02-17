import { randomBytes } from "node:crypto";
import { ORPCError } from "@orpc/server";
import { checkOrganizationAdmin } from "@repo/api/lib/membership";
import { aiAgentAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const toggleWebChat = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/{agentId}/web-chat",
		tags: ["AI Agents"],
		summary: "Toggle web chat for an AI agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			enabled: z.boolean(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const admin = await checkOrganizationAdmin(
			input.organizationId,
			user.id,
		);
		if (!admin) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be an admin of this organization",
			});
		}

		const agent = await db.aiAgent.findFirst({
			where: {
				id: input.agentId,
				organizationId: input.organizationId,
			},
		});

		if (!agent) {
			throw new ORPCError("NOT_FOUND", {
				message: "Agent not found",
			});
		}

		const updateData: Record<string, unknown> = {
			webChatEnabled: input.enabled,
		};

		// Generate token if enabling and no token exists
		if (input.enabled && !agent.webChatToken) {
			updateData["webChatToken"] = randomBytes(32).toString("hex");
		}

		const updated = await db.aiAgent.update({
			where: { id: input.agentId },
			data: updateData,
			select: {
				webChatEnabled: true,
				webChatToken: true,
			},
		});

		// Audit log (fire-and-forget)
		const auditContext = getAuditContextFromHeaders(headers);
		aiAgentAudit.webChatToggled(
			input.agentId,
			user.id,
			input.organizationId,
			auditContext,
			{ enabled: input.enabled },
		);

		return {
			webChatEnabled: updated.webChatEnabled,
			webChatToken: updated.webChatToken,
		};
	});
