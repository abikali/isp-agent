/**
 * Admin-managed dropdown lists used by the worker (field) portal.
 *
 * Every list lives in the `worker_option` table keyed by `listKey`, so admins
 * can add / rename / reorder entries from Settings → Worker Dropdowns without a
 * deploy. The defaults below are what a brand-new organization is seeded with
 * (see the org-setup worker) and what `pnpm --filter @repo/database
 * seed:worker-options` back-fills onto existing organizations.
 *
 * Pure constants with zero Node dependencies — safe to import in the browser
 * bundle (same contract as `@repo/database/enums`).
 */

export const WORKER_OPTION_LIST_KEYS = [
	"EXPENSE_CATEGORY",
	"TASK_RESOLUTION",
] as const;

export type WorkerOptionListKey = (typeof WORKER_OPTION_LIST_KEYS)[number];

export interface WorkerOptionListMeta {
	key: WorkerOptionListKey;
	/** Section heading in the settings UI. */
	title: string;
	/** Where the worker sees this dropdown. */
	description: string;
}

export const WORKER_OPTION_LISTS: WorkerOptionListMeta[] = [
	{
		key: "EXPENSE_CATEGORY",
		title: "Expense Categories",
		description:
			'The "Category" dropdown a worker picks when submitting an expense.',
	},
	{
		key: "TASK_RESOLUTION",
		title: "Task Resolutions",
		description:
			'The "What did you find?" dropdown a worker picks when completing a maintenance task.',
	},
];

export interface WorkerOptionSeed {
	value: string;
	label: string;
	labelAr?: string;
	sortOrder: number;
}

/**
 * Values match what the legacy billing worker form wrote, so historic
 * `expense.category` / `task.resolutionCode` rows keep resolving to a label.
 */
export const DEFAULT_WORKER_OPTIONS: Record<
	WorkerOptionListKey,
	WorkerOptionSeed[]
> = {
	EXPENSE_CATEGORY: [
		{ value: "toolkit", label: "Toolkit", labelAr: "عدة", sortOrder: 1 },
		{
			value: "electricity",
			label: "Electricity",
			labelAr: "كهرباء",
			sortOrder: 2,
		},
		{ value: "roof", label: "Roof", labelAr: "سطح", sortOrder: 3 },
		{ value: "other", label: "Other", labelAr: "غير ذلك", sortOrder: 4 },
	],
	TASK_RESOLUTION: [
		{
			value: "cable_problem",
			label: "Cable problem",
			labelAr: "مشكلة كابل",
			sortOrder: 1,
		},
		{
			value: "replace_rj45",
			label: "Replaced RJ45",
			labelAr: "تبديل RJ45",
			sortOrder: 2,
		},
		{
			value: "weak_signal",
			label: "Weak signal",
			labelAr: "إشارة ضعيفة",
			sortOrder: 3,
		},
		{
			value: "replace_machine",
			label: "Replaced machine",
			labelAr: "تبديل جهاز",
			sortOrder: 4,
		},
		{
			value: "router_interference",
			label: "Router interference",
			labelAr: "تشويش راوتر",
			sortOrder: 5,
		},
		{
			value: "reset_router",
			label: "Reset router",
			labelAr: "إعادة ضبط الراوتر",
			sortOrder: 6,
		},
		{
			value: "no_problem",
			label: "No problem found",
			labelAr: "لا يوجد مشكلة",
			sortOrder: 7,
		},
		{ value: "custom", label: "Other", labelAr: "غير ذلك", sortOrder: 8 },
	],
};

/**
 * `TASK_RESOLUTION` value that forces the worker to type a free-text note.
 * Kept as a constant because both the portal and the completion procedure
 * enforce it.
 */
export const CUSTOM_RESOLUTION_VALUE = "custom";

/** Label lookup for a value that may predate (or outlive) the DB rows. */
export function defaultWorkerOptionLabel(
	listKey: WorkerOptionListKey,
	value: string,
): string | undefined {
	return DEFAULT_WORKER_OPTIONS[listKey].find((o) => o.value === value)
		?.label;
}
