import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db, type Prisma } from "@repo/database";
import { runBotFollowUpSweep } from "@repo/jobs";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

/**
 * The "Bot follow-ups" page: every follow-up the bot sent or will send
 * (silence nudges, check-backs after escalations, official-number outreach)
 * with its result, plus the approve-before-send queue for outreach.
 */

export const BOT_FOLLOW_UP_TYPES = [
	"silence",
	"post_escalation",
	"post_install",
	"post_stop",
] as const;

export const BOT_FOLLOW_UP_STATUSES = [
	"pending_approval",
	"scheduled",
	"sending",
	"sent",
	"replied",
	"resolved",
	"no_reply",
	"skipped",
	"failed",
	"cancelled",
] as const;

/** The page's tabs, as status groups. */
const TAB_STATUSES: Record<string, string[]> = {
	approval: ["pending_approval"],
	scheduled: ["scheduled", "sending"],
	waiting: ["sent", "replied"],
	done: ["resolved", "no_reply", "skipped", "failed", "cancelled"],
};

const listInput = z.object({
	organizationId: z.string(),
	tab: z.enum(["approval", "scheduled", "waiting", "done"]).optional(),
	type: z.enum(BOT_FOLLOW_UP_TYPES).optional(),
	status: z.enum(BOT_FOLLOW_UP_STATUSES).optional(),
	outcome: z.string().optional(),
	customerId: z.string().optional(),
	conversationId: z.string().optional(),
	from: z.coerce.date().optional(),
	to: z.coerce.date().optional(),
	search: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

type ListInput = z.infer<typeof listInput>;

/** The row filter for list/stats. Exported for tests. */
export function buildBotFollowUpWhere(
	input: Omit<ListInput, "cursor" | "limit">,
	activeDealerId: string | null,
): Prisma.BotFollowUpWhereInput {
	const and: Prisma.BotFollowUpWhereInput[] = [
		{ organizationId: input.organizationId },
	];
	if (activeDealerId) {
		and.push({ customer: { dealerId: activeDealerId } });
	}
	if (input.tab) {
		and.push({ status: { in: TAB_STATUSES[input.tab] ?? [] } });
	}
	if (input.status) {
		and.push({ status: input.status });
	}
	if (input.type) {
		and.push({ type: input.type });
	}
	if (input.outcome) {
		and.push({ outcome: input.outcome });
	}
	if (input.customerId) {
		and.push({ customerId: input.customerId });
	}
	if (input.conversationId) {
		and.push({ conversationId: input.conversationId });
	}
	if (input.from || input.to) {
		and.push({
			createdAt: {
				...(input.from ? { gte: input.from } : {}),
				...(input.to ? { lte: input.to } : {}),
			},
		});
	}
	const search = input.search?.trim();
	if (search) {
		const contains = { contains: search, mode: "insensitive" } as const;
		and.push({
			OR: [
				{ phone: { contains: search.replace(/\D/g, "") || search } },
				{ reply: contains },
				{ customer: { firstName: contains } },
				{ customer: { lastName: contains } },
				{ customer: { username: contains } },
			],
		});
	}
	return { AND: and };
}

export const listBotFollowUps = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/bot-follow-ups",
		tags: ["AI Agents"],
		summary: "List bot follow-ups and their results",
	})
	.input(listInput)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);
		const rows = await db.botFollowUp.findMany({
			where: buildBotFollowUpWhere(input, activeDealerId),
			orderBy:
				input.tab === "approval" || input.tab === "scheduled"
					? [{ dueAt: "asc" }, { id: "asc" }]
					: [{ updatedAt: "desc" }, { id: "desc" }],
			take: input.limit + 1,
			...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
			select: {
				id: true,
				type: true,
				channel: true,
				status: true,
				outcome: true,
				reason: true,
				skipReason: true,
				phone: true,
				dueAt: true,
				sentAt: true,
				templateName: true,
				messageText: true,
				reply: true,
				replyAt: true,
				approvedAt: true,
				createdAt: true,
				updatedAt: true,
				conversationId: true,
				taskId: true,
				customerId: true,
				paymentId: true,
				customer: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						username: true,
					},
				},
			},
		});
		const hasMore = rows.length > input.limit;
		const items = hasMore ? rows.slice(0, input.limit) : rows;

		// The collector's stop note, next to the customer's own answer.
		const paymentIds = items
			.map((r) => r.paymentId)
			.filter((id): id is string => Boolean(id));
		const notes = paymentIds.length
			? await db.payment.findMany({
					where: { id: { in: paymentIds } },
					select: { id: true, notes: true },
				})
			: [];
		const noteById = new Map(notes.map((n) => [n.id, n.notes]));

		return {
			items: items.map((r) => ({
				...r,
				stopNote: r.paymentId
					? (noteById.get(r.paymentId) ?? null)
					: null,
			})),
			nextCursor: hasMore ? items[items.length - 1]?.id : undefined,
		};
	});

export const getBotFollowUpStats = protectedProcedure
	.route({
		method: "GET",
		path: "/ai-agents/bot-follow-ups/stats",
		tags: ["AI Agents"],
		summary: "Bot follow-up counts by type, status and outcome",
	})
	.input(
		z.object({
			organizationId: z.string(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"read",
		);
		const where = buildBotFollowUpWhere(input, activeDealerId);
		const [byStatus, byOutcome] = await Promise.all([
			db.botFollowUp.groupBy({
				by: ["type", "status"],
				where,
				_count: { _all: true },
			}),
			db.botFollowUp.groupBy({
				by: ["type", "outcome"],
				where: { AND: [where, { outcome: { not: null } }] },
				_count: { _all: true },
			}),
		]);
		return {
			byStatus: byStatus.map((r) => ({
				type: r.type,
				status: r.status,
				count: r._count._all,
			})),
			byOutcome: byOutcome.map((r) => ({
				type: r.type,
				outcome: r.outcome ?? "",
				count: r._count._all,
			})),
		};
	});

const idsInput = z.object({
	organizationId: z.string(),
	ids: z.array(z.string()).min(1).max(200),
});

/** Approve outreach waiting for it. Only `pending_approval` rows move. */
export const approveBotFollowUps = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/bot-follow-ups/approve",
		tags: ["AI Agents"],
		summary: "Approve bot follow-ups for sending",
	})
	.input(idsInput)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);
		const { count } = await db.botFollowUp.updateMany({
			where: {
				id: { in: input.ids },
				organizationId: input.organizationId,
				status: "pending_approval",
				...(activeDealerId
					? { customer: { dealerId: activeDealerId } }
					: {}),
			},
			data: {
				status: "scheduled",
				approvedById: user.id,
				approvedAt: new Date(),
			},
		});
		return { approved: count };
	});

export const skipBotFollowUps = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/bot-follow-ups/skip",
		tags: ["AI Agents"],
		summary: "Skip bot follow-ups that have not been sent",
	})
	.input(idsInput.extend({ reason: z.string().max(200).optional() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);
		const { count } = await db.botFollowUp.updateMany({
			where: {
				id: { in: input.ids },
				organizationId: input.organizationId,
				status: { in: ["pending_approval", "scheduled"] },
				...(activeDealerId
					? { customer: { dealerId: activeDealerId } }
					: {}),
			},
			data: {
				status: "skipped",
				skipReason: input.reason?.trim() || "skipped_by_admin",
			},
		});
		return { skipped: count };
	});

/** Send one follow-up now: due immediately, then run the sweep. */
export const sendBotFollowUpNow = protectedProcedure
	.route({
		method: "POST",
		path: "/ai-agents/bot-follow-ups/{id}/send-now",
		tags: ["AI Agents"],
		summary: "Send a bot follow-up now",
	})
	.input(z.object({ organizationId: z.string(), id: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"aiAgents",
			"update",
		);
		const now = new Date();
		const { count } = await db.botFollowUp.updateMany({
			where: {
				id: input.id,
				organizationId: input.organizationId,
				status: { in: ["pending_approval", "scheduled"] },
				...(activeDealerId
					? { customer: { dealerId: activeDealerId } }
					: {}),
			},
			data: {
				status: "scheduled",
				dueAt: now,
				approvedById: user.id,
				approvedAt: now,
			},
		});
		if (count === 0) {
			throw new ORPCError("BAD_REQUEST", {
				message: "This follow-up was already sent or closed.",
			});
		}
		// The sweep claims the row atomically, so a concurrent scheduled run
		// cannot send it twice.
		const result = await runBotFollowUpSweep(now).catch((error) => {
			logger.error("[bot-follow-ups] send-now sweep failed", { error });
			return null;
		});
		const row = await db.botFollowUp.findUnique({
			where: { id: input.id },
			select: { status: true, skipReason: true },
		});
		return {
			status: row?.status ?? "unknown",
			skipReason: row?.skipReason ?? null,
			swept: result !== null,
		};
	});
