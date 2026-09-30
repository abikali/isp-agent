import { db } from "@repo/database";
import { logger } from "@repo/logs";
import { getTaskReminderQueue } from "../queues/task-reminder.queue";

/** Statuses that still need the worker on site. */
export const REMINDER_ACTIVE_STATUSES = [
	"OPEN",
	"IN_PROGRESS",
	"ON_HOLD",
] as const;

/** A due time more than this far in the past is not worth a reminder. */
const LATE_GRACE_MS = 5 * 60_000;

// BullMQ rejects custom job ids containing ":" ("Custom Id cannot contain :").
export function taskReminderJobId(taskId: string): string {
	return `task-reminder-${taskId}`;
}

/**
 * (Re)schedule the "due soon" reminder for a task, replacing any pending one.
 * Nothing is scheduled unless the task has an exact due time, is still
 * active, has assignees, and hasn't been reminded for this due time. A task
 * created inside the lead window is reminded right away (delay 0); one whose
 * due time already passed (beyond a 5-minute grace) is not.
 *
 * Remove-before-add is required: BullMQ ignores `add` while a job with the
 * same id exists in ANY set. The worker re-checks everything at fire time, so
 * writers that don't reschedule (sync, AI tools) can't cause a wrong send.
 */
export async function scheduleTaskReminder(taskId: string): Promise<void> {
	await cancelTaskReminder(taskId);

	const task = await db.task.findUnique({
		where: { id: taskId },
		select: {
			status: true,
			dueDate: true,
			dueHasTime: true,
			reminderSentAt: true,
			organization: {
				select: {
					notifyWorkerOnTaskReminder: true,
					taskReminderLeadMinutes: true,
				},
			},
			_count: { select: { assignments: true } },
		},
	});
	if (
		!task?.dueDate ||
		!task.dueHasTime ||
		task.reminderSentAt ||
		!task.organization.notifyWorkerOnTaskReminder ||
		task._count.assignments === 0 ||
		!(REMINDER_ACTIVE_STATUSES as readonly string[]).includes(task.status)
	) {
		return;
	}
	const now = Date.now();
	if (task.dueDate.getTime() < now - LATE_GRACE_MS) {
		return;
	}
	const fireAt =
		task.dueDate.getTime() -
		task.organization.taskReminderLeadMinutes * 60_000;
	await getTaskReminderQueue().add(
		"task-reminder",
		{ taskId, dueAt: task.dueDate.toISOString() },
		{
			jobId: taskReminderJobId(taskId),
			delay: Math.max(0, fireAt - now),
		},
	);
}

/**
 * Drop the pending reminder, if any. A job already running can't be removed,
 * but the worker re-checks the task's status, so it stays silent.
 */
export async function cancelTaskReminder(taskId: string): Promise<void> {
	try {
		const job = await getTaskReminderQueue().getJob(
			taskReminderJobId(taskId),
		);
		if (job) {
			await job.remove();
		}
	} catch (error) {
		logger.debug("[task-reminder] cancel skipped", {
			taskId,
			error: String(error),
		});
	}
}
