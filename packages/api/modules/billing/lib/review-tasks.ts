/**
 * Helpers for the "Review stopped payment" task lifecycle.
 *
 * The task is created in `create-payment.ts` when a collector flags a stop;
 * it lives until admin approves (review-payment), declines (decline), or
 * the customer is reactivated (reactivate). All three closure paths use
 * `closeReviewTasksForCustomer` so the title-prefix match stays in one place.
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { notifyTaskWorkers } from "../../tasks/lib/notify-task-workers";

export const REVIEW_STOPPED_TASK_TITLE_PREFIX = "Review stopped payment:";

/**
 * A customer who came back is no longer being disconnected. Cancel every
 * UNINSTALL task still waiting on him (not ones a worker already submitted
 * for approval — the equipment is already out) and tell the assignees, so
 * nobody drives out to pull a router from a paying subscriber.
 *
 * Fire-and-forget like `closeReviewTasksForCustomer`; called from every
 * path that sets a customer ACTIVE.
 */
export async function cancelOpenUninstallTasks(
	customerId: string,
): Promise<void> {
	try {
		const tasks = await db.task.findMany({
			where: {
				customerId,
				category: "UNINSTALL",
				status: { in: ["OPEN", "IN_PROGRESS", "ON_HOLD"] },
			},
			select: {
				id: true,
				organizationId: true,
				title: true,
				notes: true,
				assignments: { select: { employeeId: true } },
			},
		});
		if (tasks.length === 0) {
			return;
		}
		const stamp = new Date().toISOString().slice(0, 10);
		for (const task of tasks) {
			await db.task.update({
				where: { id: task.id },
				data: {
					status: "CANCELLED",
					notes: `${task.notes ? `${task.notes}\n` : ""}[system] Cancelled — customer reactivated on ${stamp}.`,
				},
			});
			void notifyTaskWorkers({
				organizationId: task.organizationId,
				taskId: task.id,
				taskTitle: task.title,
				employeeIds: task.assignments.map((a) => a.employeeId),
				event: "cancelled",
				detail: "The customer was reactivated — do not uninstall.",
			});
		}
	} catch (err) {
		logger.warn("[Uninstall] Failed to cancel open uninstall tasks", {
			customerId,
			error: String(err),
		});
	}
}

/**
 * Fire-and-forget: task lifecycle is a UX hint, not a hard dependency.
 * Failure is logged and swallowed.
 */
export async function closeReviewTasksForCustomer(
	organizationId: string,
	customerId: string,
): Promise<void> {
	try {
		await db.task.updateMany({
			where: {
				organizationId,
				customerId,
				status: "OPEN",
				title: { startsWith: REVIEW_STOPPED_TASK_TITLE_PREFIX },
			},
			data: {
				status: "COMPLETED",
				completedAt: new Date(),
			},
		});
	} catch (err) {
		logger.warn("[Stopped Payment] Failed to close review task", {
			customerId,
			error: String(err),
		});
	}
}
