import { invalidateStat } from "@repo/api/lib/stat-cache";
import { FINANCE_STAT_CACHE } from "../../finance/lib/cache";

/** Cache names for the collectors / workers hubs (`cachedStat`). */
export const BILLING_STAT_CACHE = {
	collectorsList: "billing/collectors/list",
	workersList: "billing/workers/list",
} as const;

/**
 * Drop one organization's cached cash numbers after a cash-ledger write, so
 * the hubs' "in hand" column and the Money page reflect the move right away
 * instead of after the TTL. Fire-and-forget; the cache is best-effort.
 */
export function bustCashStats(organizationId: string): void {
	for (const name of [
		BILLING_STAT_CACHE.collectorsList,
		BILLING_STAT_CACHE.workersList,
		FINANCE_STAT_CACHE.summary,
		FINANCE_STAT_CACHE.trend,
	]) {
		void invalidateStat(name, [organizationId]);
	}
}
