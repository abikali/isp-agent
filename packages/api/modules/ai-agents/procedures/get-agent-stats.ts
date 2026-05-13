import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getAgentStats = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/{agentId}/stats",
		tags: ["AI Agents"],
		summary: "Get agent statistics",
	})
	.input(
		z.object({
			agentId: z.string(),
			organizationId: z.string(),
			period: z.enum(["7d", "30d", "90d"]).default("30d"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
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
		});
		if (!agent) {
			throw new ORPCError("NOT_FOUND", {
				message: "Agent not found",
			});
		}

		const days =
			input.period === "7d" ? 7 : input.period === "30d" ? 30 : 90;
		const since = new Date();
		since.setDate(since.getDate() - days);

		const [
			messageStats,
			conversationCount,
			totalConversations,
			conversationsByDay,
			messagesWithTools,
		] = await Promise.all([
			db.aiMessage.aggregate({
				where: {
					conversation: { agentId: input.agentId },
					createdAt: { gte: since },
				},
				_count: true,
				_sum: { tokenCount: true },
				_avg: { latencyMs: true },
			}),
			db.aiConversation.count({
				where: {
					agentId: input.agentId,
					createdAt: { gte: since },
				},
			}),
			db.aiConversation.count({
				where: { agentId: input.agentId },
			}),
			db.aiConversation.findMany({
				where: {
					agentId: input.agentId,
					createdAt: { gte: since },
				},
				select: {
					createdAt: true,
					channel: { select: { provider: true } },
				},
			}),
			db.aiMessage.findMany({
				where: {
					conversation: { agentId: input.agentId },
					createdAt: { gte: since },
					OR: [
						{ toolCalls: { not: { equals: null } } },
						{ parts: { not: { equals: null } } },
					],
				},
				select: { toolCalls: true, parts: true },
				take: 5_000,
			}),
		]);

		const dayKey = (d: Date) => d.toISOString().slice(0, 10);
		const emptyDays: { day: string }[] = [];
		const today = new Date();
		today.setUTCHours(0, 0, 0, 0);
		for (let i = days - 1; i >= 0; i--) {
			const d = new Date(today);
			d.setUTCDate(d.getUTCDate() - i);
			emptyDays.push({ day: dayKey(d) });
		}

		type ChannelBucket = {
			web: number;
			whatsapp: number;
			telegram: number;
			other: number;
		};
		const channelMap = new Map<string, ChannelBucket>();
		for (const c of conversationsByDay) {
			const k = dayKey(c.createdAt);
			const entry = channelMap.get(k) ?? {
				web: 0,
				whatsapp: 0,
				telegram: 0,
				other: 0,
			};
			const ch = (c.channel?.provider ?? "").toLowerCase();
			if (ch.includes("web")) {
				entry.web += 1;
			} else if (ch.includes("whatsapp")) {
				entry.whatsapp += 1;
			} else if (ch.includes("telegram")) {
				entry.telegram += 1;
			} else {
				entry.other += 1;
			}
			channelMap.set(k, entry);
		}
		const conversationsSeries = emptyDays.map((d) => ({
			day: d.day,
			...(channelMap.get(d.day) ?? {
				web: 0,
				whatsapp: 0,
				telegram: 0,
				other: 0,
			}),
		}));

		const toolCounts = new Map<string, number>();
		for (const m of messagesWithTools) {
			if (Array.isArray(m.parts)) {
				for (const part of m.parts as Array<{
					type?: string;
					toolName?: string;
				}>) {
					if (
						typeof part?.type === "string" &&
						part.type.startsWith("tool-")
					) {
						const name =
							part.type.replace(/^tool-/, "") ||
							part.toolName ||
							"unknown";
						toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
					}
				}
			} else if (Array.isArray(m.toolCalls)) {
				for (const call of m.toolCalls as Array<{
					toolName?: string;
				}>) {
					const name = call?.toolName ?? "unknown";
					toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
				}
			}
		}
		const toolBreakdown = Array.from(toolCounts.entries())
			.map(([tool, count]) => ({ tool, count }))
			.sort((a, b) => b.count - a.count);

		return {
			stats: {
				period: input.period,
				totalMessages: messageStats._count,
				totalTokens: messageStats._sum.tokenCount ?? 0,
				avgLatencyMs: Math.round(messageStats._avg.latencyMs ?? 0),
				conversationsInPeriod: conversationCount,
				totalConversations,
			},
			conversationsSeries,
			toolBreakdown,
		};
	});
