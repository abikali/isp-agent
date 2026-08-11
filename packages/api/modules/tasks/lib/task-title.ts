/**
 * Task titles are derived, not typed in. A creator picks a category and a
 * target (customer or base); the title falls out of those so every task in the
 * list reads the same way. The trailing code is the task id's tail, which keeps
 * two identical visits to the same customer distinguishable at a glance.
 *
 * Shared with the web app so the create form can preview exactly what it will
 * store — the format lives here only.
 */

export type TaskTitleCategory =
	| "INSTALLATION"
	| "MAINTENANCE"
	| "REPLACEMENT"
	| "REPAIR"
	| "SUPPORT"
	| "BILLING"
	| "GENERAL"
	| "UNINSTALL";

const CATEGORY_TITLES: Record<TaskTitleCategory, string> = {
	INSTALLATION: "Installation",
	MAINTENANCE: "Maintenance",
	REPLACEMENT: "Replacement",
	REPAIR: "Repair",
	SUPPORT: "Support",
	BILLING: "Billing",
	GENERAL: "Task",
	UNINSTALL: "Uninstall",
};

const MAX_TARGET_LENGTH = 40;

/** Short unique suffix for a task title, taken from the task's own id. */
export function taskTitleCode(taskId: string) {
	return taskId.slice(-4).toUpperCase();
}

/**
 * "Installation — Ahmad Khoury #7K2M", or "Support #A1B2" with no target.
 * Omit `code` to render a preview before the task (and its id) exists.
 */
export function buildTaskTitle({
	category,
	target,
	code,
}: {
	category: TaskTitleCategory;
	target?: string | null | undefined;
	code?: string | null | undefined;
}) {
	const name = target?.trim();
	const head = name
		? `${CATEGORY_TITLES[category]} — ${
				name.length > MAX_TARGET_LENGTH
					? `${name.slice(0, MAX_TARGET_LENGTH - 1).trimEnd()}…`
					: name
			}`
		: CATEGORY_TITLES[category];

	return code ? `${head} #${code}` : head;
}
