import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import { requirePermission } from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, taskAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { taskDealerScopeWhere } from "../lib/dealer-scope";

export const reviewTaskCompletion = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/{taskId}/review-completion",
		tags: ["Tasks"],
		summary:
			"Approve a pending task completion (closes the task) or reject it (returns it to In Progress)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			taskId: z.string(),
			action: z.enum(["approve", "reject"]),
			// Shown to the worker when rejecting
			note: z.string().max(1000).optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"tasks",
			"approve",
		);

		const task = await db.task.findFirst({
			where: {
				id: input.taskId,
				organizationId: input.organizationId,
				status: "PENDING_APPROVAL",
				...taskDealerScopeWhere(activeDealerId),
			},
			select: {
				id: true,
				title: true,
				completedAt: true,
				completedByEmployeeId: true,
			},
		});
		if (!task) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found or not awaiting approval",
			});
		}

		const approved = input.action === "approve";
		const updated = await db.task.update({
			where: { id: task.id },
			data: approved
				? {
						status: "COMPLETED",
						completedAt: task.completedAt ?? new Date(),
					}
				: {
						// Back to the worker's queue; evidence fields stay for
						// reference and are overwritten on resubmission.
						status: "IN_PROGRESS",
						completedAt: null,
					},
			select: { id: true, status: true, completedAt: true },
		});

		const auditContext = getAuditContextFromHeaders(headers);
		taskAudit.updated(task.id, user.id, input.organizationId, auditContext);

		if (task.completedByEmployeeId) {
			const detail = approved
				? "Your completion was approved"
				: `Your completion was rejected — the task is back in your queue${input.note ? `. Reason: ${input.note}` : ""}`;
			notifyFieldEmployee({
				organizationId: input.organizationId,
				employeeId: task.completedByEmployeeId,
				title: approved ? "Task approved" : "Task completion rejected",
				message: `"${task.title}": ${detail}`,
				type: approved ? "success" : "warning",
				telegramText: tgMessage({
					icon: approved ? "✅" : "↩️",
					title: approved
						? "Task approved"
						: "Task completion rejected",
					fields: [
						{ icon: "🛠️", value: task.title },
						...(input.note && !approved
							? [{ icon: "📝", value: input.note }]
							: []),
					],
				}),
			}).catch((err: unknown) =>
				logger.warn("[Task Review] notify failed", {
					error: String(err),
				}),
			);
		}

		return { task: updated };
	});
