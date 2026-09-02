/**
 * Cache names for the finance stats served through `cachedStat`.
 *
 * Both keys start with the organization id (see `statCacheKey` calls), which is
 * what lets `finance.refresh` drop one org's entries without touching anyone
 * else's.
 */
export const FINANCE_STAT_CACHE = {
	summary: "finance/summary",
	trend: "finance/trend",
} as const;
