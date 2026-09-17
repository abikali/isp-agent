import { ORPCError } from "@orpc/server";
import {
	getActionScope,
	getUserEmployeeId,
	hasPermission,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { taskDealerScopeWhere } from "../lib/dealer-scope";
import {
	appendTaskNote,
	buildEscalationCloseNote,
} from "../lib/escalation-close";

const DAY_MS = 24 * 60 * 60 * 1000;
const WRITE_CHUNK = 100;

/**
 * Close OPEN AI escalations — either the rows picked on the Escalations page
 * or every one created more than `olderThanDays` ago. Closing marks the task
 * COMPLETED (same approve gate as completing through tasks.update) and appends
 * a note naming who closed it. Tasks outside the caller's dealer / own scope,
 * or no longer OPEN, are silently skipped; `count` is what actually closed.
 */
export const closeEscalations = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/escalations/close",
		tags: ["Tasks"],
		summary: "Close AI escalation tasks in bulk",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				taskIds: z.array(z.string()).min(1).max(500).optional(),
				olderThanDays: z.number().int().min(1).max(365).optional(),
			})
			.refine(
				(v) =>
					(v.taskIds === undefined) !==
					(v.olderThanDays === undefined),
				{ message: "Pass either taskIds or olderThanDays" },
			),
	)
	.handler(async ({ context: { user }, input }) => {
		const closedAt = new Date();
		const candidates = await db.task.findMany({
			where: await closableEscalationsWhere({
				organizationId: input.organizationId,
				userId: user.id,
				taskIds: input.taskIds,
				olderThanDays: input.olderThanDays,
				now: closedAt,
			}),
			select: { id: true, notes: true },
		});

		const note = buildEscalationCloseNote({
			closedByName: user.name || user.email,
			closedAt,
			olderThanDays: input.olderThanDays,
		});

		let count = 0;
		for (let i = 0; i < candidates.length; i += WRITE_CHUNK) {
			const chunk = candidates.slice(i, i + WRITE_CHUNK);
			// Per-row because each task keeps its own notes; the status guard
			// skips anything someone else closed since the read above.
			const results = await db.$transaction(
				chunk.map((task) =>
					db.task.updateMany({
						where: { id: task.id, status: "OPEN" },
						data: {
							status: "COMPLETED",
							completedAt: closedAt,
							notes: appendTaskNote(task.notes, note),
						},
					}),
				),
			);
			count += results.reduce((sum, r) => sum + r.count, 0);
		}

		return { count };
	});

/**
 * OPEN AI escalations the caller may close: the picked ids, or every one
 * created more than `olderThanDays` ago. Checks the same permissions as
 * completing a task (update + approve) and applies dealer / own scope.
 */
async function closableEscalationsWhere({
	organizationId,
	userId,
	taskIds,
	olderThanDays,
	now,
}: {
	organizationId: string;
	userId: string;
	taskIds?: string[] | undefined;
	olderThanDays?: number | undefined;
	now: Date;
}) {
	const { permCtx, activeDealerId } = await requirePermission(
		organizationId,
		userId,
		"tasks",
		"update",
	);
	if (!hasPermission(permCtx, "tasks", "approve")) {
		throw new ORPCError("FORBIDDEN", {
			message: "Closing escalations requires task approval permission",
		});
	}

	const andClauses: Record<string, unknown>[] = [
		taskDealerScopeWhere(activeDealerId),
	];
	if (getActionScope(permCtx, "tasks", "update") === "own") {
		const empId = await getUserEmployeeId(organizationId, userId);
		andClauses.push({
			OR: [
				{ createdById: userId },
				...(empId
					? [{ assignments: { some: { employeeId: empId } } }]
					: []),
			],
		});
	}

	return {
		organizationId,
		source: "AI_ESCALATION" as const,
		status: "OPEN" as const,
		...(taskIds
			? { id: { in: taskIds } }
			: {
					createdAt: {
						lt: new Date(
							now.getTime() - (olderThanDays ?? 0) * DAY_MS,
						),
					},
				}),
		AND: andClauses,
	};
}

/** How many escalations "Close old…" would close, shown before confirming. */
export const countClosableEscalations = protectedProcedure
	.route({
		method: "GET",
		path: "/tasks/escalations/closable-count",
		tags: ["Tasks"],
		summary: "Count open AI escalations older than N days",
	})
	.input(
		z.object({
			organizationId: z.string(),
			olderThanDays: z.number().int().min(1).max(365),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const count = await db.task.count({
			where: await closableEscalationsWhere({
				organizationId: input.organizationId,
				userId: user.id,
				olderThanDays: input.olderThanDays,
				now: new Date(),
			}),
		});
		return { count };
	});
