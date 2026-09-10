import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import { db, parsePhones } from "@repo/database";
import { logger } from "@repo/logs";
import { getBaseUrl, tgLink, tgMessage } from "@repo/utils";
import { CATEGORY_LABELS_AR, CATEGORY_TITLES } from "./task-title";

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

		// The Telegram message is what the worker reads on site, so it
		// carries the job itself: who, where, which numbers (tap-to-copy),
		// the username he types into the router, and when it is due.
		const task = await db.task.findUnique({
			where: { id: input.taskId },
			select: {
				category: true,
				dueDate: true,
				notes: true,
				customer: {
					select: {
						firstName: true,
						lastName: true,
						username: true,
						accountNumber: true,
						phones: true,
						mobile: true,
						phone: true,
						address: true,
					},
				},
				base: { select: { name: true, address: true } },
				station: { select: { name: true } },
			},
		});
		const customer = task?.customer ?? null;
		const phones = customer
			? [
					...new Set(
						[
							...parsePhones(customer.phones).map(
								(p) => p.number,
							),
							customer.mobile,
							customer.phone,
						].filter((n): n is string => Boolean(n)),
					),
				]
			: [];
		const categoryLabel = task
			? `${(CATEGORY_TITLES as Record<string, string>)[task.category] ?? task.category} · ${CATEGORY_LABELS_AR[task.category] ?? ""}`.trim()
			: null;
		const icon =
			input.event === "cancelled"
				? "❌"
				: input.event === "updated"
					? "✏️"
					: "🛠️";
		const telegramText = tgMessage({
			icon,
			title: `${copy.title}${categoryLabel ? ` — ${categoryLabel}` : ""}`,
			fields: [
				customer
					? {
							icon: "👤",
							value:
								[customer.firstName, customer.lastName]
									.filter(Boolean)
									.join(" ") ||
								customer.username ||
								"Customer",
						}
					: task?.base
						? { icon: "🏢", value: task.base.name }
						: task?.station
							? { icon: "📡", value: task.station.name }
							: null,
				customer?.username
					? {
							icon: "🔑",
							label: "Username",
							value: customer.username,
							copyable: true,
						}
					: null,
				customer?.accountNumber
					? {
							icon: "🔢",
							label: "Account",
							value: customer.accountNumber,
							copyable: true,
						}
					: null,
				...phones.map((number) => ({
					icon: "📞",
					value: number,
					copyable: true,
				})),
				customer?.address
					? { icon: "📍", value: customer.address }
					: task?.base?.address
						? { icon: "📍", value: task.base.address }
						: null,
				task?.dueDate
					? {
							icon: "📅",
							label: "Due",
							value: task.dueDate.toISOString().slice(0, 10),
						}
					: null,
				input.detail ? { icon: "ℹ️", value: input.detail } : null,
				task?.notes ? { icon: "📝", value: task.notes } : null,
			],
			footer: tgLink("Open task", `${getBaseUrl()}${link}`),
		});

		await Promise.all(
			employeeIds.map((employeeId) =>
				notifyFieldEmployee({
					organizationId: input.organizationId,
					employeeId,
					title: `${copy.title}: ${input.taskTitle}`,
					message,
					link,
					type: copy.type,
					telegramText,
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
