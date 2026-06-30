import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import { db } from "@repo/database";
import { logger } from "@repo/logs";

/** Worker-facing task events an org can opt out of notifying about. */
export type TaskWorkerEvent = "assigned" | "updated" | "cancelled";

const EVENT_TOGGLE: Record<
	TaskWorkerEvent,
	| "notifyWorkerOnTaskAssigned"
	| "notifyWorkerOnTaskUpdated"
	| "notifyWorkerOnTaskCancelled"
> = {
	assigned: "notifyWorkerOnTaskAssigned",
	updated: "notifyWorkerOnTaskUpdated",
	cancelled: "notifyWorkerOnTaskCancelled",
};

const EVENT_COPY: Record<
	TaskWorkerEvent,
	{ title: string; message: string; type: "info" | "warning" }
> = {
	assigned: {
		title: "New task assigned",
		message: "A new task has been assigned to you.",
		type: "info",
	},
	updated: {
		title: "Task updated",
		message: "A task assigned to you was updated.",
		type: "info",
	},
	cancelled: {
		title: "Task cancelled",
		message: "A task assigned to you was cancelled.",
		type: "warning",
	},
};

interface NotifyTaskWorkersInput {
	organizationId: string;
	taskId: string;
	taskTitle: string;
	/** Employees to notify (e.g. all assignees, or only the newly-assigned). */
	employeeIds: string[];
	event: TaskWorkerEvent;
	/** Optional extra line appended to the message (due date, reason, etc.). */
	detail?: string;
}

/**
 * Notify a task's assigned workers (in-app + Telegram, via
 * {@link notifyFieldEmployee}) about a task event, gated by the org's
 * per-event toggle from Settings → Notifications. Fire-and-forget — call
 * without awaiting; a Telegram/DB hiccup must never fail the task mutation.
 */
export async function notifyTaskWorkers(
	input: NotifyTaskWorkersInput,
): Promise<void> {
	const employeeIds = [...new Set(input.employeeIds)];
	if (employeeIds.length === 0) {
		return;
	}
	try {
		const org = await db.organization.findUnique({
			where: { id: input.organizationId },
			select: {
				slug: true,
				notifyWorkerOnTaskAssigned: true,
				notifyWorkerOnTaskUpdated: true,
				notifyWorkerOnTaskCancelled: true,
			},
		});
		if (!org || !org[EVENT_TOGGLE[input.event]]) {
			return;
		}

		const copy = EVENT_COPY[input.event];
		const message = input.detail
			? `${copy.message}\n${input.detail}`
			: copy.message;
		const link = `/app/${org.slug}/tasks/${input.taskId}`;

		await Promise.all(
			employeeIds.map((employeeId) =>
				notifyFieldEmployee({
					organizationId: input.organizationId,
					employeeId,
					title: `${copy.title}: ${input.taskTitle}`,
					message,
					link,
					type: copy.type,
				}),
			),
		);
	} catch (error) {
		logger.warn("[Notify Task Workers] Failed to notify assignees", {
			taskId: input.taskId,
			event: input.event,
			error: String(error),
		});
	}
}
