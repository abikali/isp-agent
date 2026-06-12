/**
 * Canned maintenance resolutions — mirrors
 * packages/api/modules/tasks/lib/resolutions.ts (kept separate so the
 * client bundle doesn't import the API package).
 */
export const TASK_RESOLUTION_OPTIONS = [
	{ value: "cable_problem", label: "Cable problem" },
	{ value: "replace_rj45", label: "Replaced RJ45" },
	{ value: "weak_signal", label: "Weak signal" },
	{ value: "replace_machine", label: "Replaced machine" },
	{ value: "router_interference", label: "Router interference" },
	{ value: "reset_router", label: "Reset router" },
	{ value: "no_problem", label: "No problem found" },
	{ value: "custom", label: "Other" },
] as const;

export type TaskResolutionCode =
	(typeof TASK_RESOLUTION_OPTIONS)[number]["value"];

export const TASK_RESOLUTION_LABELS: Record<TaskResolutionCode, string> =
	Object.fromEntries(
		TASK_RESOLUTION_OPTIONS.map((o) => [o.value, o.label]),
	) as Record<TaskResolutionCode, string>;
