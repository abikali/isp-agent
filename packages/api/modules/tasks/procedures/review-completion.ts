import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import { requirePermission } from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, taskAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { bilingual, tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { taskDealerScopeWhere } from "../lib/dealer-scope";

export const reviewTaskCompletion = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/{taskId}/review-completion",
		tags: ["Tasks"],
		summary:
			"Approve a pending task completion (closes the task) or reject it (returns it to Open)",
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
		const updated = await db.$transaction(async (tx) => {
			if (!approved) {
				// The worker resubmits the evidence from scratch, which creates
				// fresh installation / recovered-item rows. Deny the rejected
				// submission's pending rows so they don't turn into duplicates
				// (and don't keep reserving the worker's stock).
				await tx.installation.updateMany({
					where: { taskId: task.id, status: "PENDING" },
					data: {
						status: "DENIED",
						approvedById: user.id,
						approvedAt: new Date(),
					},
				});
				await tx.uninstalledItem.updateMany({
					where: { taskId: task.id, status: "PENDING" },
					data: {
						status: "DENIED",
						reviewedById: user.id,
						reviewedAt: new Date(),
					},
				});
			}
			return tx.task.update({
				where: { id: task.id },
				data: approved
					? {
							status: "COMPLETED",
							completedAt: task.completedAt ?? new Date(),
						}
					: {
							// Back to the worker's queue. Evidence fields stay for
							// reference and are overwritten on resubmission —
							// `completedByEmployeeId` surviving with a cleared
							// `completedAt` on an OPEN task is what marks it as
							// returned (see isReturned in the tasks UI).
							status: "OPEN",
							completedAt: null,
						},
				select: { id: true, status: true, completedAt: true },
			});
		});

		const auditContext = getAuditContextFromHeaders(headers);
		taskAudit.updated(task.id, user.id, input.organizationId, auditContext);

		if (task.completedByEmployeeId) {
			const detail = approved
				? bilingual(
						"Your completion was approved",
						"تمت الموافقة على إنهاء المهمة",
					)
				: `${bilingual(
						"Your completion was rejected — the task is back in your queue",
						"تم رفض إنهاء المهمة — عادت المهمة إلى قائمتك",
					)}${input.note ? `. ${bilingual("Reason", "السبب")}: ${input.note}` : ""}`;
			const title = approved
				? bilingual("Task approved", "تمت الموافقة على المهمة")
				: bilingual("Task completion rejected", "تم رفض إنهاء المهمة");
			notifyFieldEmployee({
				organizationId: input.organizationId,
				employeeId: task.completedByEmployeeId,
				title,
				message: `"${task.title}": ${detail}`,
				type: approved ? "success" : "warning",
				telegramText: tgMessage({
					icon: approved ? "✅" : "↩️",
					title,
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
