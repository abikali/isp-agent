import { ORPCError } from "@orpc/server";
import { AI_PROVIDERS, encryptToken, isModelAvailable } from "@repo/ai";
import { requirePermission, verifyPermission } from "@repo/api/lib/permission";
import { aiAgentAudit, getAuditContextFromHeaders } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { cancelFollowUp } from "@repo/jobs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const updateAgent = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/{agentId}",
		tags: ["AI Agents"],
		summary: "Update an AI agent",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			name: z.string().min(1).max(100).optional(),
			description: z.string().max(500).optional(),
			systemPrompt: z.string().min(1).max(15000).optional(),
			greetingMessage: z.string().max(1000).optional(),
			model: z.string().optional(),
			provider: z.enum(AI_PROVIDERS).optional(),
			/** Write-only. Omit to keep the stored key, null to remove it. */
			apiKey: z.string().trim().min(8).max(500).nullable().optional(),
			knowledgeBase: z.string().max(50000).optional(),
			enabled: z.boolean().optional(),
			maintenanceMode: z.boolean().optional(),
			maintenanceMessage: z.string().max(2000).optional(),
			maxHistoryLength: z.number().int().min(1).max(50).optional(),
			temperature: z.number().min(0).max(2).optional(),
			enabledTools: z.array(z.string()).optional(),
			servicePlansEnabled: z.boolean().optional(),
			servicePlanIds: z.array(z.string()).optional(),
			contextGapThresholdMinutes: z
				.number()
				.int()
				.min(60)
				.max(1440)
				.optional(),
			humanTakeoverHours: z
				.number()
				.min(0.5)
				.max(48)
				.nullable()
				.optional(),
			workingHoursEnabled: z.boolean().optional(),
			workingDays: z
				.array(z.number().int().min(0).max(6))
				.max(7)
				.optional(),
			workingHoursStart: z
				.string()
				.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
				.optional(),
			workingHoursEnd: z
				.string()
				.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
				.optional(),
			offDutyMessage: z.string().max(2000).nullable().optional(),
			followUpMinutes: z
				.number()
				.int()
				.min(5)
				.max(1440)
				.nullable()
				.optional(),
			followUpMessage: z.string().max(1000).nullable().optional(),
			followUpMaxAttempts: z.number().int().min(1).max(3).optional(),
			followUpRepeatMinutes: z
				.number()
				.int()
				.min(60)
				.max(4320)
				.optional(),
			followUpWindowStart: z
				.string()
				.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
				.optional(),
			followUpWindowEnd: z
				.string()
				.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
				.optional(),
			followUpWeeklyCap: z.number().int().min(1).max(14).optional(),
			postEscalationCheckMinutes: z
				.number()
				.int()
				.min(60)
				.max(4320)
				.nullable()
				.optional(),
			conversationSummaryMode: z
				.enum(["off", "each", "digest"])
				.optional(),
			conversationSummaryIdleMinutes: z
				.number()
				.int()
				.min(10)
				.max(720)
				.optional(),
			outreachRequireApproval: z.boolean().optional(),
			postInstallFollowUpDays: z
				.number()
				.int()
				.min(1)
				.max(30)
				.nullable()
				.optional(),
			postStopFollowUpEnabled: z.boolean().optional(),
			postStopFollowUpTime: z
				.string()
				.regex(/^([01]\d|2[0-3]):[0-5]\d$/)
				.optional(),
			voiceReplies: z.boolean().optional(),
			voiceReplyModel: z.string().max(100).nullable().optional(),
			promptSections: z
				.array(
					z.object({
						id: z.string(),
						label: z.string(),
						content: z.string(),
						enabled: z.boolean(),
						condition: z
							.enum([
								"always",
								"has-tools",
								"has-tools-non-webchat",
							])
							.optional(),
					}),
				)
				.optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);

		const existing = await db.aiAgent.findFirst({
			where: { id: input.agentId, organizationId: input.organizationId },
			select: {
				id: true,
				createdById: true,
				maintenanceMessage: true,
				model: true,
				provider: true,
				encryptedApiKey: true,
				followUpMinutes: true,
				followUpWindowStart: true,
				followUpWindowEnd: true,
			},
		});
		if (!existing) {
			throw new ORPCError("NOT_FOUND", {
				message: "Agent not found",
			});
		}

		verifyPermission(permCtx, "aiAgents", "update", {
			resourceCreatedById: existing.createdById,
		});

		// Validate: maintenanceMessage required when enabling maintenanceMode
		if (input.maintenanceMode === true) {
			const message =
				input.maintenanceMessage ?? existing.maintenanceMessage;
			if (!message) {
				throw new ORPCError("BAD_REQUEST", {
					message:
						"A maintenance message is required when enabling maintenance mode",
				});
			}
		}

		if (
			input.workingHoursEnabled === true &&
			input.workingHoursStart &&
			input.workingHoursEnd &&
			input.workingHoursStart >= input.workingHoursEnd
		) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Working hours must end after they start",
			});
		}
		if (
			input.workingHoursEnabled === true &&
			input.workingDays?.length === 0
		) {
			throw new ORPCError("BAD_REQUEST", {
				message: "Pick at least one working day",
			});
		}

		const provider = input.provider ?? existing.provider;
		const model = input.model ?? existing.model;
		if (
			!isModelAvailable(model, provider as (typeof AI_PROVIDERS)[number])
		) {
			throw new ORPCError("BAD_REQUEST", {
				message: `${model} is not available from ${provider}. Pick another model or use OpenRouter.`,
			});
		}
		// A key belongs to one provider: switching needs the new one.
		if (provider !== existing.provider && !input.apiKey) {
			throw new ORPCError("BAD_REQUEST", {
				message: `Enter the ${provider} API key to switch provider`,
			});
		}
		const windowStart =
			input.followUpWindowStart ?? existing.followUpWindowStart;
		const windowEnd = input.followUpWindowEnd ?? existing.followUpWindowEnd;
		if (windowStart >= windowEnd) {
			throw new ORPCError("BAD_REQUEST", {
				message: "The follow-up window must end after it starts",
			});
		}

		const { agentId, organizationId, apiKey, ...rest } = input;

		// Build update data, converting undefined optional fields to null for Prisma
		const updateData: Record<string, unknown> = {};
		if (rest.name !== undefined) {
			updateData["name"] = rest.name;
		}
		if (rest.description !== undefined) {
			updateData["description"] = rest.description ?? null;
		}
		if (rest.systemPrompt !== undefined) {
			updateData["systemPrompt"] = rest.systemPrompt;
		}
		if (rest.greetingMessage !== undefined) {
			updateData["greetingMessage"] = rest.greetingMessage ?? null;
		}
		if (rest.model !== undefined) {
			updateData["model"] = rest.model;
		}
		if (rest.provider !== undefined) {
			updateData["provider"] = rest.provider;
		}
		if (apiKey !== undefined) {
			updateData["encryptedApiKey"] = apiKey
				? encryptToken(apiKey)
				: null;
		}
		if (rest.knowledgeBase !== undefined) {
			updateData["knowledgeBase"] = rest.knowledgeBase ?? null;
		}
		if (rest.enabled !== undefined) {
			updateData["enabled"] = rest.enabled;
		}
		if (rest.maintenanceMode !== undefined) {
			updateData["maintenanceMode"] = rest.maintenanceMode;
		}
		if (rest.maintenanceMessage !== undefined) {
			updateData["maintenanceMessage"] = rest.maintenanceMessage ?? null;
		}
		if (rest.maxHistoryLength !== undefined) {
			updateData["maxHistoryLength"] = rest.maxHistoryLength;
		}
		if (rest.temperature !== undefined) {
			updateData["temperature"] = rest.temperature;
		}
		if (rest.enabledTools !== undefined) {
			updateData["enabledTools"] = rest.enabledTools;
		}
		if (rest.servicePlansEnabled !== undefined) {
			updateData["servicePlansEnabled"] = rest.servicePlansEnabled;
		}
		if (rest.servicePlanIds !== undefined) {
			updateData["servicePlanIds"] = rest.servicePlanIds;
		}
		if (rest.contextGapThresholdMinutes !== undefined) {
			updateData["contextGapThresholdMinutes"] =
				rest.contextGapThresholdMinutes;
		}
		if (rest.humanTakeoverHours !== undefined) {
			updateData["humanTakeoverHours"] = rest.humanTakeoverHours ?? null;
		}
		if (rest.promptSections !== undefined) {
			updateData["promptSections"] = JSON.parse(
				JSON.stringify(rest.promptSections),
			);
		}
		for (const key of [
			"workingHoursEnabled",
			"workingDays",
			"workingHoursStart",
			"workingHoursEnd",
		] as const) {
			if (rest[key] !== undefined) {
				updateData[key] = rest[key];
			}
		}
		if (rest.offDutyMessage !== undefined) {
			updateData["offDutyMessage"] = rest.offDutyMessage ?? null;
		}
		if (rest.followUpMinutes !== undefined) {
			updateData["followUpMinutes"] = rest.followUpMinutes ?? null;
		}
		if (rest.followUpMessage !== undefined) {
			updateData["followUpMessage"] = rest.followUpMessage ?? null;
		}
		for (const key of [
			"followUpMaxAttempts",
			"followUpRepeatMinutes",
			"followUpWindowStart",
			"followUpWindowEnd",
			"followUpWeeklyCap",
			"postEscalationCheckMinutes",
			"conversationSummaryMode",
			"conversationSummaryIdleMinutes",
			"outreachRequireApproval",
			"postInstallFollowUpDays",
			"postStopFollowUpEnabled",
			"postStopFollowUpTime",
			"voiceReplies",
			"voiceReplyModel",
		] as const) {
			if (rest[key] !== undefined) {
				updateData[key] = rest[key];
			}
		}

		const agent = await db.aiAgent.update({
			where: { id: agentId },
			data: updateData,
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
				workingHoursEnabled: true,
				workingDays: true,
				workingHoursStart: true,
				workingHoursEnd: true,
				offDutyMessage: true,
				followUpMinutes: true,
				followUpMessage: true,
				followUpMaxAttempts: true,
				followUpRepeatMinutes: true,
				followUpWindowStart: true,
				followUpWindowEnd: true,
				followUpWeeklyCap: true,
				postEscalationCheckMinutes: true,
				conversationSummaryMode: true,
				conversationSummaryIdleMinutes: true,
				outreachRequireApproval: true,
				postInstallFollowUpDays: true,
				postStopFollowUpEnabled: true,
				postStopFollowUpTime: true,
				voiceReplies: true,
				voiceReplyModel: true,
				provider: true,
				promptSections: true,
				updatedAt: true,
			},
		});

		// Turning follow-ups off drops the nudges already queued.
		if (existing.followUpMinutes != null && agent.followUpMinutes == null) {
			const queued = await db.aiConversation.findMany({
				where: { agentId, followUpDueAt: { not: null } },
				select: { id: true },
			});
			await Promise.all(queued.map((c) => cancelFollowUp(c.id)));
		}

		const auditContext = getAuditContextFromHeaders(headers);
		aiAgentAudit.updated(agentId, user.id, organizationId, auditContext);

		return { agent };
	});
