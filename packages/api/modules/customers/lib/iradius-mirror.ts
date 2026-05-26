import { ORPCError } from "@orpc/server";
import { logger } from "@repo/logs";

/**
 * Single enforced pattern for any procedure that mutates an iRadius-mirrored
 * field. Calls iRadius first; only if that succeeds does the local DB write
 * run. On any remote failure the local write is never executed and the
 * caller sees an ORPCError — no silent drift.
 *
 * When `iradiusDisabled` is true (org has opted out of iRadius integration)
 * the remote call is skipped entirely and only the local write runs. The
 * org-level flag is the single source of truth for this — every mirror call
 * site must read it from `requirePermission` and forward it here.
 *
 * Do NOT introduce local-first or fire-and-forget alternatives.
 */
export async function mirrorToIRadius<T>(opts: {
	logTag: string;
	failureMessage: string;
	remote: () => Promise<unknown>;
	local: () => Promise<T>;
	iradiusDisabled?: boolean;
}): Promise<T> {
	if (opts.iradiusDisabled) {
		return opts.local();
	}
	try {
		await opts.remote();
	} catch (error) {
		// A caller's remote step may throw a deliberate, typed ORPCError to
		// drive specific client handling (e.g. a "user missing in iRadius"
		// prompt). Pass those through untouched; only unexpected remote
		// failures get masked as a generic 500.
		if (error instanceof ORPCError) {
			throw error;
		}
		logger.error(`${opts.logTag} failed`, {
			error: error instanceof Error ? error.message : error,
		});
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: opts.failureMessage,
		});
	}
	return opts.local();
}
