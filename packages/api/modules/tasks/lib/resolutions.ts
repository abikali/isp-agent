/**
 * Canned maintenance-task resolutions (ported from the legacy billing system's
 * worker maintenance replies). "custom" requires a resolutionNote.
 */
export const TASK_RESOLUTION_CODES = [
	"cable_problem",
	"replace_rj45",
	"weak_signal",
	"replace_machine",
	"router_interference",
	"reset_router",
	"no_problem",
	"custom",
] as const;

export type TaskResolutionCode = (typeof TASK_RESOLUTION_CODES)[number];

export const TASK_RESOLUTION_LABELS: Record<TaskResolutionCode, string> = {
	cable_problem: "Cable problem",
	replace_rj45: "Replaced RJ45",
	weak_signal: "Weak signal",
	replace_machine: "Replaced machine",
	router_interference: "Router interference",
	reset_router: "Reset router",
	no_problem: "No problem found",
	custom: "Other",
};
