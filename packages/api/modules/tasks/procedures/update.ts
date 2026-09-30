import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	hasPermission,
	requirePermission,
	verifyTaskOwnership,
} from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, taskAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { scheduleTaskReminder } from "@repo/jobs";
import { logger } from "@repo/logs";
import { bilingual, formatBeirutDue } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { taskInDealerScope } from "../lib/dealer-scope";
import { notifyTaskWorkers } from "../lib/notify-task-workers";
import { bustTaskStats } from "../lib/stats-cache";

/** Arabic priority names for the worker notification. */
const PRIORITY_AR: Record<"LOW" | "MEDIUM" | "HIGH" | "URGENT", string> = {
	LOW: "منخفضة",
	MEDIUM: "متوسطة",
	HIGH: "عالية",
	URGENT: "عاجلة",
};

export const updateTask = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/update",
		tags: ["Tasks"],
		summary: "Update a task",
	})
	.input(
		z.object({
			organizationId: z.string(),
			id: z.string(),
			title: z.string().min(1).max(500).optional(),
			description: z.string().max(5000).nullable().optional(),
			priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
			// PENDING_APPROVAL is system-owned: only completeWithEvidence puts a
			// task there, and only reviewCompletion takes it out. Letting it be
			// set by hand parked tasks in the approval queue with no evidence.
			status: z.enum(["OPEN", "COMPLETED", "CANCELLED"]).optional(),
			category: z
				.enum([
					"INSTALLATION",
					"MAINTENANCE",
					"REPLACEMENT",
					"REPAIR",
					"SUPPORT",
					"BILLING",
					"GENERAL",
					"UNINSTALL",
				])
				.optional(),
			dueDate: z.coerce.date().nullable().optional(),
			// Defaults to false whenever dueDate is sent without it, so
			// API-key clients that only know dates stay date-only.
			dueHasTime: z.boolean().optional(),
			notes: z.string().max(5000).nullable().optional(),
			customerId: z.string().nullable().optional(),
			stationId: z.string().nullable().optional(),
			baseId: z.string().nullable().optional(),
			followUpStatus: z
				.enum([
					"pending",
					"contacted",
					"promised",
					"resolved",
					"escalated",
				])
				.optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"update",
		);

		const existing = await db.task.findFirst({
			where: { id: input.id, organizationId: input.organizationId },
			include: {
				assignments: {
					select: {
						employeeId: true,
						employee: { select: { id: true, dealerId: true } },
					},
				},
				customer: { select: { dealerId: true } },
			},
		});
		if (!existing || !taskInDealerScope(existing, activeDealerId)) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found",
			});
		}

		await verifyTaskOwnership(permCtx, "update", existing);

		if (input.baseId) {
			const base = await db.base.findFirst({
				where: {
					id: input.baseId,
					organizationId: input.organizationId,
					...getDealerScopeFilter(activeDealerId),
				},
				select: { id: true },
			});
			if (!base) {
				throw new ORPCError("FORBIDDEN", {
					message: "Base does not belong to your dealer",
				});
			}
		}

		const updateData: Record<string, unknown> = {};
		if (input.title !== undefined) {
			updateData["title"] = input.title;
		}
		if (input.description !== undefined) {
			updateData["description"] = input.description ?? null;
		}
		if (input.priority !== undefined) {
			updateData["priority"] = input.priority;
		}
		if (input.category !== undefined) {
			updateData["category"] = input.category;
		}
		const nextDueDate =
			input.dueDate !== undefined ? input.dueDate : existing.dueDate;
		const nextDueHasTime = nextDueDate
			? input.dueDate !== undefined || input.dueHasTime !== undefined
				? Boolean(input.dueHasTime)
				: existing.dueHasTime
			: false;
		const dueChanged =
			Number(nextDueDate ?? 0) !== Number(existing.dueDate ?? 0) ||
			nextDueHasTime !== existing.dueHasTime;
		if (dueChanged) {
			updateData["dueDate"] = nextDueDate;
			updateData["dueHasTime"] = nextDueHasTime;
			// A new due time earns a new reminder.
			updateData["reminderSentAt"] = null;
		}
		if (input.notes !== undefined) {
			updateData["notes"] = input.notes ?? null;
		}
		if (input.customerId !== undefined) {
			updateData["customerId"] = input.customerId ?? null;
		}
		if (input.stationId !== undefined) {
			updateData["stationId"] = input.stationId ?? null;
		}
		if (input.baseId !== undefined) {
			updateData["baseId"] = input.baseId ?? null;
		}
		if (input.followUpStatus !== undefined) {
			updateData["followUpStatus"] = input.followUpStatus;
		}

		// Auto-manage completedAt based on status transitions
		if (input.status !== undefined) {
			// Marking a task COMPLETED is an approval act — without the
			// approve permission, completions must go through
			// completeWithEvidence / reviewCompletion instead.
			if (
				input.status === "COMPLETED" &&
				existing.status !== "COMPLETED" &&
				!hasPermission(permCtx, "tasks", "approve")
			) {
				throw new ORPCError("FORBIDDEN", {
					message:
						"Completing a task requires admin approval — submit your completion for review instead",
				});
			}
			updateData["status"] = input.status;
			if (
				input.status === "COMPLETED" &&
				existing.status !== "COMPLETED"
			) {
				// Keep the field-work timestamp when approving a pending
				// completion via the edit form.
				updateData["completedAt"] =
					existing.status === "PENDING_APPROVAL" &&
					existing.completedAt
						? existing.completedAt
						: new Date();
			} else if (
				input.status !== "COMPLETED" &&
				(existing.status === "COMPLETED" ||
					existing.status === "PENDING_APPROVAL")
			) {
				updateData["completedAt"] = null;
			}
		}

		const task = await db.task.update({
			where: { id: input.id },
			data: updateData,
			select: {
				id: true,
				title: true,
				status: true,
				priority: true,
				category: true,
				createdAt: true,
			},
		});

		bustTaskStats(input.organizationId);

		const auditContext = getAuditContextFromHeaders(headers);
		taskAudit.updated(task.id, user.id, input.organizationId, auditContext);

		// Fire-and-forget: keep assigned workers in the loop on cancels and
		// reschedules. A cancel supersedes the "updated" ping for the same edit.
		const assigneeIds = existing.assignments.map((a) => a.employeeId);
		if (assigneeIds.length > 0) {
			const becameCancelled =
				input.status === "CANCELLED" && existing.status !== "CANCELLED";
			if (becameCancelled) {
				notifyTaskWorkers({
					organizationId: input.organizationId,
					taskId: task.id,
					taskTitle: task.title,
					employeeIds: assigneeIds,
					event: "cancelled",
				});
			} else {
				const priorityChanged =
					input.priority !== undefined &&
					input.priority !== existing.priority;
				const finalStatus = input.status ?? existing.status;
				const active =
					finalStatus !== "CANCELLED" && finalStatus !== "COMPLETED";
				if (active && (dueChanged || priorityChanged)) {
					const details: string[] = [];
					if (dueChanged) {
						details.push(
							nextDueDate
								? bilingual(
										`New due date: ${formatBeirutDue(nextDueDate, nextDueHasTime)}`,
										`موعد جديد: ${formatBeirutDue(nextDueDate, nextDueHasTime)}`,
									)
								: bilingual("Due date cleared", "أُزيل الموعد"),
						);
					}
					if (priorityChanged && input.priority) {
						details.push(
							bilingual(
								`Priority: ${input.priority}`,
								`الأولوية: ${PRIORITY_AR[input.priority]}`,
							),
						);
					}
					notifyTaskWorkers({
						organizationId: input.organizationId,
						taskId: task.id,
						taskTitle: task.title,
						employeeIds: assigneeIds,
						event: "updated",
						...(details.length
							? { detail: details.join("\n") }
							: {}),
					});
				}
			}
		}

		// The reminder job re-reads the task at fire time; reschedule only when
		// the due time or status moved (schedule cancels when not applicable).
		if (dueChanged || input.status !== undefined) {
			scheduleTaskReminder(task.id).catch((err: unknown) =>
				logger.warn("[Task Update] reminder schedule failed", {
					error: String(err),
				}),
			);
		}

		return { task };
	});
