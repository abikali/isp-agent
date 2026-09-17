import { invalidateStat } from "@repo/api/lib/stat-cache";

/** Cache name for `tasks.stats` (sidebar Tasks badge, dashboard, Tasks page). */
export const TASK_STATS_CACHE = "tasks/stats";

/**
 * Every mutation that changes a task's status, assignees or existence — or a
 * recovered item's review state — must call this so the refetch the client
 * fires right after (invalidateQueries on `tasks.key()`) sees the new counts
 * instead of the cached snapshot. Without it an approver clears the queue and
 * the sidebar badge keeps showing the old number for up to the cache TTL.
 */
export function bustTaskStats(organizationId: string): void {
	void invalidateStat(TASK_STATS_CACHE, [organizationId]);
}
