import { ORPCError } from "@orpc/server";
import { requirePermission, verifyPermission } from "@repo/api/lib/permission";
import { aiAgentAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const deleteAgent = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/{agentId}/delete",
		tags: ["AI Agents"],
		summary: "Delete an AI agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"delete",
		);

		const existing = await db.aiAgent.findFirst({
			where: {
				id: input.agentId,
				organizationId: input.organizationId,
			},
			select: { id: true, createdById: true },
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Agent not found",
			});
		}

		verifyPermission(permCtx, "aiAgents", "delete", {
			resourceCreatedById: existing.createdById,
		});

		await db.aiAgent.delete({
			where: { id: input.agentId },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		aiAgentAudit.deleted(
			input.agentId,
			user.id,
			input.organizationId,
			auditContext,
		);

		return { success: true };
	});
