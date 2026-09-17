import { notifyFieldEmployee } from "@repo/api/lib/notify-employee";
import { db, parsePhones, type TaskCategory } from "@repo/database";
import { logger } from "@repo/logs";
import { bilingual, getBaseUrl, tgLink, tgMessage } from "@repo/utils";
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
		title: bilingual("New task assigned", "مهمة جديدة"),
		message: bilingual(
			"A new task has been assigned to you.",
			"تم تعيين مهمة جديدة لك.",
		),
		type: "info",
	},
	updated: {
		title: bilingual("Task updated", "تم تعديل المهمة"),
		message: bilingual(
			"A task assigned to you was updated.",
			"تم تعديل مهمة معيّنة لك.",
		),
		type: "info",
	},
	cancelled: {
		title: bilingual("Task cancelled", "تم إلغاء المهمة"),
		message: bilingual(
			"A task assigned to you was cancelled.",
			"تم إلغاء مهمة معيّنة لك.",
		),
		type: "warning",
	},
};

/** "Installation · تركيب" for the worker Telegram headline. */
export function taskCategoryLabel(category: TaskCategory): string {
	const en =
		(CATEGORY_TITLES as Partial<Record<TaskCategory, string>>)[category] ??
		category;
	return bilingual(en, CATEGORY_LABELS_AR[category]);
}

/**
 * Where a task notification should open for this employee. Field-portal
 * workers are redirected off /app to the portal home, so theirs opens the
 * task inside /work instead.
 */
export function taskLinkFor(
	preferredLayout: string | undefined,
	orgSlug: string | null,
	taskId: string,
): string {
	return preferredLayout === "worker"
		? `/work/${orgSlug}/tasks?task=${encodeURIComponent(taskId)}`
		: `/app/${orgSlug}/tasks/${taskId}`;
}

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
		// Workers on the field portal are redirected away from /app, so their
		// link opens the task inside /work instead of landing on the home tab.
		const employees = await db.employee.findMany({
			where: {
				id: { in: employeeIds },
				organizationId: input.organizationId,
			},
			select: { id: true, preferredLayout: true },
		});
		const layoutById = new Map(
			employees.map((e) => [e.id, e.preferredLayout]),
		);

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
		const categoryLabel = task ? taskCategoryLabel(task.category) : null;
		const icon =
			input.event === "cancelled"
				? "❌"
				: input.event === "updated"
					? "✏️"
					: "🛠️";
		const telegramText = (link: string) =>
			tgMessage({
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
									bilingual("Customer", "زبون"),
							}
						: task?.base
							? { icon: "🏢", value: task.base.name }
							: task?.station
								? { icon: "📡", value: task.station.name }
								: null,
					customer?.username
						? {
								icon: "🔑",
								label: bilingual("Username", "اسم المستخدم"),
								value: customer.username,
								copyable: true,
							}
						: null,
					customer?.accountNumber
						? {
								icon: "🔢",
								label: bilingual("Account", "رقم الحساب"),
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
								label: bilingual("Due", "الموعد"),
								value: task.dueDate.toISOString().slice(0, 10),
							}
						: null,
					input.detail ? { icon: "ℹ️", value: input.detail } : null,
					task?.notes ? { icon: "📝", value: task.notes } : null,
				],
				footer: tgLink(
					bilingual("Open task", "فتح المهمة"),
					`${getBaseUrl()}${link}`,
				),
			});

		await Promise.all(
			employeeIds.map((employeeId) => {
				const link = taskLinkFor(
					layoutById.get(employeeId),
					org.slug,
					input.taskId,
				);
				return notifyFieldEmployee({
					organizationId: input.organizationId,
					employeeId,
					title: `${copy.title}: ${input.taskTitle}`,
					message,
					link,
					type: copy.type,
					telegramText: telegramText(link),
				});
			}),
		);
	} catch (error) {
		logger.warn("[Notify Task Workers] Failed to notify assignees", {
			taskId: input.taskId,
			event: input.event,
			error: String(error),
		});
	}
}
