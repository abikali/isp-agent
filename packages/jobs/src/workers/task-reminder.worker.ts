import { config } from "@repo/config";
import { db, parsePhones } from "@repo/database";
import { logger } from "@repo/logs";
import {
	bilingual,
	buildTaskTelegramText,
	getBaseUrl,
	taskLinkFor,
} from "@repo/utils";
import { type Job, Worker } from "bullmq";
import { getRedisConnection } from "../connection";
import { REMINDER_ACTIVE_STATUSES } from "../jobs/task-reminder.jobs";
import { queueTelegramNotify } from "../jobs/telegram-notify.jobs";
import { TASK_REMINDER_QUEUE_NAME } from "../queues/task-reminder.queue";
import type { TaskReminderJobData, TaskReminderJobResult } from "../types";

export interface TaskReminderWorkerDeps {
	/**
	 * In-app notification for an employee's linked user. Injected by the
	 * worker process: @repo/notifications depends on this package.
	 */
	notifyUser?: (input: {
		userId: string;
		organizationId: string;
		title: string;
		message: string;
		link: string;
	}) => Promise<void>;
}

/**
 * Send one task's due reminder. Everything is re-read at fire time: the task
 * may have been rescheduled (stale `dueAt`), closed, reassigned or already
 * reminded since the job was queued. The conditional claim on
 * `reminderSentAt` makes a duplicate job (sweep + scheduled) send once.
 */
export async function processTaskReminder(
	data: TaskReminderJobData,
	deps: TaskReminderWorkerDeps = {},
): Promise<TaskReminderJobResult> {
	const task = await db.task.findUnique({
		where: { id: data.taskId },
		select: {
			id: true,
			organizationId: true,
			title: true,
			status: true,
			dueDate: true,
			dueHasTime: true,
			reminderSentAt: true,
			notes: true,
			organization: {
				select: { slug: true, notifyWorkerOnTaskReminder: true },
			},
			customer: {
				select: {
					firstName: true,
					lastName: true,
					username: true,
					accountNumber: true,
					address: true,
					phones: true,
					mobile: true,
					phone: true,
				},
			},
			base: { select: { name: true, address: true } },
			station: { select: { name: true } },
			assignments: {
				select: {
					employee: {
						select: {
							id: true,
							userId: true,
							telegramChatId: true,
							preferredLayout: true,
						},
					},
				},
			},
		},
	});
	if (!task) {
		return { sent: 0, skipped: "not_found" };
	}
	if (
		!(REMINDER_ACTIVE_STATUSES as readonly string[]).includes(task.status)
	) {
		return { sent: 0, skipped: "inactive" };
	}
	if (
		!task.dueHasTime ||
		!task.dueDate ||
		task.dueDate.toISOString() !== data.dueAt
	) {
		return { sent: 0, skipped: "stale" };
	}
	if (task.reminderSentAt) {
		return { sent: 0, skipped: "already_sent" };
	}
	if (!task.organization.notifyWorkerOnTaskReminder) {
		return { sent: 0, skipped: "disabled" };
	}
	if (task.assignments.length === 0) {
		return { sent: 0, skipped: "no_assignees" };
	}

	const claimed = await db.task.updateMany({
		where: { id: task.id, reminderSentAt: null, dueDate: task.dueDate },
		data: { reminderSentAt: new Date() },
	});
	if (claimed.count !== 1) {
		return { sent: 0, skipped: "already_sent" };
	}

	const minutes = Math.max(
		0,
		Math.round((task.dueDate.getTime() - Date.now()) / 60_000),
	);
	const title = bilingual(
		`Task due in ${minutes} min`,
		`المهمة مستحقة خلال ${minutes} دقيقة`,
	);
	const customer = task.customer;
	const phones = customer
		? [
				...new Set(
					[
						...parsePhones(customer.phones).map((p) => p.number),
						customer.mobile,
						customer.phone,
					].filter((n): n is string => Boolean(n)),
				),
			]
		: [];

	let sent = 0;
	for (const { employee } of task.assignments) {
		const link = taskLinkFor(
			employee.preferredLayout,
			task.organization.slug,
			task.id,
		);
		try {
			if (employee.userId && deps.notifyUser) {
				await deps.notifyUser({
					userId: employee.userId,
					organizationId: task.organizationId,
					title: `${title}: ${task.title}`,
					message: bilingual(
						"A task assigned to you is due soon.",
						"مهمة معيّنة لك موعدها قريب.",
					),
					link,
				});
			}
			if (employee.telegramChatId) {
				await queueTelegramNotify({
					organizationId: task.organizationId,
					employeeId: employee.id,
					parseMode: "HTML",
					text: buildTaskTelegramText({
						icon: "⏰",
						title,
						task,
						phones,
						showTaskTitle: true,
						url: `${getBaseUrl()}${link}`,
					}),
				});
			}
			sent++;
		} catch (error) {
			logger.warn("[task-reminder] notify failed", {
				taskId: task.id,
				employeeId: employee.id,
				error: String(error),
			});
		}
	}
	return { sent };
}

export function createTaskReminderWorker(
	deps: TaskReminderWorkerDeps = {},
): Worker<TaskReminderJobData, TaskReminderJobResult> {
	return new Worker<TaskReminderJobData, TaskReminderJobResult>(
		TASK_REMINDER_QUEUE_NAME,
		(job: Job<TaskReminderJobData>) => processTaskReminder(job.data, deps),
		{
			connection: getRedisConnection(),
			concurrency: config.jobs.workers.taskReminder.concurrency,
		},
	);
}
