import { ORPCError } from "@orpc/server";
import { getRedisConnection } from "@repo/jobs";
import { logger } from "@repo/logs";

/**
 * Server-side double-submit guard for dealer money writes.
 *
 * On 2026-09-02 a confirm button was clicked twice and iRadius received two
 * identical credit top-ups three seconds apart. The client is now disabled
 * while a request runs, but the client is not the last line of defence: two
 * requests in flight at once both pass every local check because neither has
 * written its mirror row yet. So the same write is fenced in Redis for a
 * short window — the second request is refused before it reaches iRadius.
 *
 * The key is the write's own identity (dealer + side + amount), not the
 * caller: two people crediting the same dealer the same amount inside two
 * minutes is far more likely a double entry than two real ones. Whoever hits
 * the fence is told how long to wait.
 */
const WINDOW_SECONDS = 120;
const PREFIX = "dealer-write:";

export async function acquireDealerWriteLock(parts: {
	dealerId: string;
	side: "credit" | "debit";
	amount: number;
}): Promise<string | null> {
	const key = `${PREFIX}${parts.dealerId}:${parts.side}:${parts.amount.toFixed(2)}`;
	try {
		const result = await getRedisConnection().set(
			key,
			String(Date.now()),
			"EX",
			WINDOW_SECONDS,
			"NX",
		);
		if (result !== "OK") {
			throw new ORPCError("CONFLICT", {
				message: `The same ${parts.side === "credit" ? "credit" : "payment"} for this dealer was recorded moments ago. If you really mean to record it again, wait two minutes.`,
			});
		}
		return key;
	} catch (error) {
		if (error instanceof ORPCError) {
			throw error;
		}
		// Redis down: log and let the write through rather than block money
		// work on a cache outage — the client-side guard still applies.
		logger.warn("[dealers] write guard unavailable, proceeding", { error });
		return null;
	}
}

/** Free the fence when the remote write failed, so a retry is not refused. */
export async function releaseDealerWriteLock(key: string | null) {
	if (!key) {
		return;
	}
	try {
		await getRedisConnection().del(key);
	} catch {
		// It expires on its own.
	}
}
