/**
 * Tiny in-memory TTL cache for expensive, read-only dashboard aggregations
 * (customer / billing / task stats) that render in the app shell on EVERY page.
 * They re-fire on every navigation and on the client's ~30s refetch interval;
 * recomputing several count/groupBy queries each time floods the shared DB node
 * under the parallel burst. Caching the RESULT for a short TTL (<= the client
 * refetch interval, so perceived freshness is unchanged) collapses that burst.
 *
 * The key MUST encode the full permission scope (org + active dealer + ownership
 * filter) so a dealer/collector with read:own never sees another scope's
 * numbers. Authorization itself is NOT cached — callers still run
 * requirePermission on every request; only the aggregation result is cached.
 *
 * Per-process (mirrors lib/membership.ts's role cache); fine for the single web
 * instance and self-evicting via TTL.
 */
const cache = new Map<string, { data: unknown; expiresAt: number }>();
const DEFAULT_TTL_MS = 20_000;

export async function cachedStat<T>(
	key: string,
	fn: () => Promise<T>,
	ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
	const now = Date.now();
	const hit = cache.get(key);
	if (hit && hit.expiresAt > now) {
		return hit.data as T;
	}
	const data = await fn();
	cache.set(key, { data, expiresAt: now + ttlMs });
	// Lazy cleanup of expired entries when the cache grows.
	if (cache.size > 500) {
		for (const [k, v] of cache) {
			if (v.expiresAt <= now) {
				cache.delete(k);
			}
		}
	}
	return data;
}

/**
 * Build a scope-stable cache key. Objects (e.g. the ownership filter) are
 * JSON-serialized so distinct scopes never collide.
 */
export function statCacheKey(name: string, parts: unknown[]): string {
	const scope = parts
		.map((p) =>
			p && typeof p === "object" ? JSON.stringify(p) : String(p ?? ""),
		)
		.join("|");
	return `${name}|${scope}`;
}
