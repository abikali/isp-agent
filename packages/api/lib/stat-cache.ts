import { getRedisConnection } from "@repo/jobs";

/**
 * Short-TTL cache for expensive, read-only dashboard aggregations (customer /
 * billing / task stats) that render in the app shell on EVERY page. They re-fire
 * on every navigation and on the client's ~30s refetch interval; recomputing
 * several count/groupBy queries each time floods the shared DB node under the
 * parallel burst. Caching the RESULT for a short TTL (<= the client refetch
 * interval, so perceived freshness is unchanged) collapses that burst.
 *
 * Backed by Redis (shared) rather than per-process memory: the web app runs
 * several worker processes, so an in-memory cache would only hit ~1/N of the
 * time. Redis gives every process the same cached value.
 *
 * The key MUST encode the full permission scope (org + active dealer + ownership
 * / collector scope + input) so a dealer/collector with read:own never sees
 * another scope's numbers. Authorization itself is NOT cached — callers still
 * run requirePermission on every request; only the aggregation result is cached.
 *
 * All Redis access is best-effort: any error degrades cleanly to computing the
 * value (the endpoint must never break because the cache is unavailable).
 */
const DEFAULT_TTL_MS = 20_000;
const PREFIX = "statcache:";

export async function cachedStat<T>(
	key: string,
	fn: () => Promise<T>,
	ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> {
	const redisKey = PREFIX + key;

	let redis: ReturnType<typeof getRedisConnection> | null = null;
	try {
		redis = getRedisConnection();
	} catch {
		// Redis not configured — just compute.
		return fn();
	}

	try {
		const hit = await redis.get(redisKey);
		if (hit !== null) {
			return JSON.parse(hit) as T;
		}
	} catch {
		// Read/parse error — fall through to compute.
	}

	// Compute OUTSIDE the try so a handler error propagates normally and `fn`
	// runs exactly once.
	const data = await fn();

	try {
		await redis.set(redisKey, JSON.stringify(data), "PX", ttlMs);
	} catch {
		// Write error — ignore; value is still returned.
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
