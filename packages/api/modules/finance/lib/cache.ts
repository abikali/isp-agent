/**
 * Cache names for the finance stats served through `cachedStat`.
 *
 * Both keys start with the organization id (see `statCacheKey` calls), which is
 * what lets `finance.refresh` drop one org's entries without touching anyone
 * else's.
 */
export const FINANCE_STAT_CACHE = {
	// v2: cash position gained dealersOwe; receivables drop deleted customers.
	summary: "finance/summary-v2",
	trend: "finance/trend",
} as const;
