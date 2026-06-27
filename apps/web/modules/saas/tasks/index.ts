// Server-safe exports only
// For client components/hooks, import from "@saas/tasks/client"

export {
	FOLLOW_UP_STATUS_COLORS,
	FOLLOW_UP_STATUS_LABELS,
	TASK_CATEGORY_LABELS,
	TASK_CATEGORY_OPTIONS,
	TASK_PRIORITY_BG_COLORS,
	TASK_PRIORITY_LABELS,
	TASK_PRIORITY_OPTIONS,
	TASK_SOURCE_LABELS,
	TASK_STATUS_BG_COLORS,
	TASK_STATUS_COLORS,
	TASK_STATUS_LABELS,
	TASK_STATUS_OPTIONS,
} from "./lib/constants";

export {
	TASK_RESOLUTION_LABELS,
	TASK_RESOLUTION_OPTIONS,
	type TaskResolutionCode,
} from "./lib/resolution-labels";
export { isOverdue, timeAgo } from "./lib/task-utils";
