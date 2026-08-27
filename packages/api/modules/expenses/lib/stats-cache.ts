import { invalidateStat } from "@repo/api/lib/stat-cache";

/** Cache name for `expenses.stats` (the sidebar pending-expenses badge). */
export const EXPENSE_STATS_CACHE = "expenses/stats";

/**
 * Every mutation that changes a claim's status or amount must call this so the
 * badge refetch the client fires right after (invalidateQueries on
 * `expenses.key()`) sees the new numbers instead of the cached snapshot.
 */
export function bustExpenseStats(): void {
	void invalidateStat(EXPENSE_STATS_CACHE);
}
