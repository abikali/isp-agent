import { ORPCError } from "@orpc/server";
import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import { hasPermission, requirePermission } from "@repo/api/lib/permission";
import { getAuditContextFromHeaders, taskAudit } from "@repo/auth/lib/audit";
import { db } from "@repo/database";
import { cancelTaskReminder, scheduleTaskReminder } from "@repo/jobs";
import { logger } from "@repo/logs";
import { bilingual, tgMessage } from "@repo/utils";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { mirrorToIRadius } from "../../customers/lib/iradius-mirror";
import { pushAddonPricesToIRadius } from "../../installations/lib/addon-price-mirror";
import {
	clearApElectricalAfterUninstall,
	pushApElectricalToIRadius,
} from "../../installations/lib/electricity-mirror";
import { taskDealerScopeWhere } from "../lib/dealer-scope";
import {
	approvableTaskLines,
	approveTaskLinesInTx,
	revertTaskLinesInTx,
	TASK_LINES_SELECT,
} from "../lib/review-task-lines";
import { bustTaskStats } from "../lib/stats-cache";

export const reviewTaskCompletion = protectedProcedure
	.route({
		method: "POST",
		path: "/tasks/{taskId}/review-completion",
		tags: ["Tasks"],
		summary:
			"Approve a pending task completion with its installed / recovered items (closes the task), or reject it and revert them (returns it to Open)",
	})
	.input(
		z.object({
			organizationId: z.string(),
			taskId: z.string(),
			action: z.enum(["approve", "reject"]),
			// Shown to the worker when rejecting
			note: z.string().max(1000).optional(),
			// Reject only: leave already-approved recovered gear in the
			// worker's stock (e.g. he already handed it on).
			keepRecovered: z.boolean().optional(),
		}),
	)
	.handler(async ({ context: { user, headers }, input }) => {
		const { permCtx, activeDealerId, iradiusDisabled } =
			await requirePermission(
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
				customer: {
					select: {
						externalId: true,
						firstName: true,
						lastName: true,
					},
				},
				...TASK_LINES_SELECT,
			},
		});
		if (!task) {
			throw new ORPCError("NOT_FOUND", {
				message: "Task not found or not awaiting approval",
			});
		}

		const approved = input.action === "approve";
		const lines = approvableTaskLines(task);
		const touchesItems = approved
			? lines.installations.length > 0 || lines.recovered.length > 0
			: task.installations.some(
					(l) => l.status === "APPROVED" && !l.setupRequestId,
				) ||
				(!input.keepRecovered &&
					task.uninstalledItems.some((i) => i.status === "APPROVED"));
		if (
			touchesItems &&
			!hasPermission(permCtx, "installations", "approve")
		) {
			throw new ORPCError("FORBIDDEN", {
				message: "You can approve the task but not its items",
			});
		}

		let approvedCounts = { installations: 0, recovered: 0 };
		let addonPriceKept: Array<{ note: string | null; price: number }> = [];
		let updated: { id: string; status: string; completedAt: Date | null };

		if (approved) {
			const addonLines = lines.installations.filter((l) => l.isAddOn);
			// Add-on lines set the customer's IPTV / Real IP price and an
			// electricity item sets AP Electrical — both iRadius-mirrored:
			// push remote-first, approve locally only once iRadius accepted.
			updated = await mirrorToIRadius({
				iradiusDisabled,
				logTag: "[Task Review] iRadius add-on price / AP electrical",
				failureMessage:
					"Failed to update the customer in iRadius (add-on price / AP electrical) — task not approved",
				remote: async () => {
					await pushAddonPricesToIRadius(task.customer, addonLines);
					await pushApElectricalToIRadius(
						task.customer,
						lines.installations,
					);
				},
				local: () =>
					db.$transaction(async (tx) => {
						approvedCounts = await approveTaskLinesInTx(
							tx,
							lines,
							user.id,
						);
						return tx.task.update({
							where: { id: task.id },
							data: {
								status: "COMPLETED",
								completedAt: task.completedAt ?? new Date(),
							},
							select: {
								id: true,
								status: true,
								completedAt: true,
							},
						});
					}),
			});
		} else {
			updated = await db.$transaction(async (tx) => {
				// The worker resubmits the evidence from scratch, which creates
				// fresh installation / recovered-item rows — so this
				// submission's lines are closed: pending ones denied, approved
				// ones reverted (stock back, cash entry removed).
				const reverted = await revertTaskLinesInTx(
					tx,
					task.id,
					task,
					user.id,
					{ keepRecovered: Boolean(input.keepRecovered) },
				);
				addonPriceKept = reverted.addonPriceKept;
				return tx.task.update({
					where: { id: task.id },
					data: {
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
		}

		bustTaskStats(input.organizationId);
		if (approved) {
			await clearApElectricalAfterUninstall({
				organizationId: input.organizationId,
				uninstalledItemIds: lines.recovered.map((item) => item.id),
				iradiusDisabled,
			});
		}
		(approved
			? cancelTaskReminder(task.id)
			: scheduleTaskReminder(task.id)
		).catch((err: unknown) =>
			logger.warn("[Task Review] reminder update failed", {
				error: String(err),
			}),
		);

		const auditContext = getAuditContextFromHeaders(headers);
		taskAudit.updated(task.id, user.id, input.organizationId, auditContext);

		if (task.completedByEmployeeId) {
			const itemsSummary = approved
				? approvedItemsSummary(approvedCounts)
				: null;
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
				message: `"${task.title}": ${detail}${itemsSummary ? `\n${itemsSummary}` : ""}`,
				type: approved ? "success" : "warning",
				telegramText: tgMessage({
					icon: approved ? "✅" : "↩️",
					title,
					fields: [
						{ icon: "🛠️", value: task.title },
						itemsSummary
							? { icon: "🧰", value: itemsSummary }
							: null,
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

		return {
			task: updated,
			approved: approvedCounts,
			skipped: lines.skipped.map((l) => ({ id: l.id, notes: l.notes })),
			addonPriceKept,
		};
	});

/** "2 items approved, 1 recovered item added to your stock" — bilingual. */
function approvedItemsSummary(counts: {
	installations: number;
	recovered: number;
}): string | null {
	const parts: Array<[string, string]> = [];
	if (counts.installations > 0) {
		parts.push([
			`${counts.installations} installed item${counts.installations === 1 ? "" : "s"} approved`,
			`تمت الموافقة على ${counts.installations} من الأغراض المركّبة`,
		]);
	}
	if (counts.recovered > 0) {
		parts.push([
			`${counts.recovered} recovered item${counts.recovered === 1 ? "" : "s"} added to your stock`,
			`أُضيف ${counts.recovered} من الأغراض المفكوكة إلى مخزونك`,
		]);
	}
	if (parts.length === 0) {
		return null;
	}
	return bilingual(
		parts.map(([en]) => en).join(", "),
		parts.map(([, ar]) => ar).join("، "),
	);
}
