import { formatBeirutDue } from "./beirut-time";
import { bilingual } from "./bilingual";
import { type TgField, tgLink, tgMessage } from "./telegram-format";

/**
 * Where a task notification should open for this employee. Field-portal
 * workers are redirected off /app to the portal home, so theirs opens the
 * task inside /work instead.
 */
export function taskLinkFor(
	preferredLayout: string | null | undefined,
	orgSlug: string | null,
	taskId: string,
): string {
	return preferredLayout === "worker"
		? `/work/${orgSlug}/tasks?task=${encodeURIComponent(taskId)}`
		: `/app/${orgSlug}/tasks/${taskId}`;
}

export interface TaskMessageTask {
	title?: string | null;
	dueDate: Date | null;
	dueHasTime: boolean;
	notes: string | null;
	customer: {
		firstName: string | null;
		lastName: string | null;
		username: string | null;
		accountNumber: string | null;
		address: string | null;
	} | null;
	base: { name: string; address: string | null } | null;
	station: { name: string } | null;
}

/**
 * The worker Telegram message for a task event. It carries the job itself:
 * who, where, which numbers (tap-to-copy), the username he types into the
 * router, and when it is due. Shared by the API's task notifications and the
 * jobs package's due reminder so the format lives in one place.
 */
export function buildTaskTelegramText(input: {
	icon: string;
	title: string;
	task: TaskMessageTask | null;
	/** De-duplicated customer phone numbers. */
	phones: string[];
	/** Show the task title as the first line (the reminder has no other context). */
	showTaskTitle?: boolean;
	detail?: string | undefined;
	/** Absolute URL of the task. */
	url: string;
}): string {
	const { task } = input;
	const customer = task?.customer ?? null;
	const fields: Array<TgField | null> = [
		input.showTaskTitle && task?.title
			? { icon: "🛠️", value: task.title }
			: null,
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
		...input.phones.map((number) => ({
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
					value: formatBeirutDue(task.dueDate, task.dueHasTime),
				}
			: null,
		input.detail ? { icon: "ℹ️", value: input.detail } : null,
		task?.notes ? { icon: "📝", value: task.notes } : null,
	];
	return tgMessage({
		icon: input.icon,
		title: input.title,
		fields,
		footer: tgLink(bilingual("Open task", "فتح المهمة"), input.url),
	});
}
