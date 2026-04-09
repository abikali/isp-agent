import { ORPCError } from "@orpc/server";
import { logger } from "@repo/logs";

/**
 * Single enforced pattern for any procedure that mutates an iRadius-mirrored
 * field. Calls iRadius first; only if that succeeds does the local DB write
 * run. On any remote failure the local write is never executed and the
 * caller sees an ORPCError — no silent drift.
 *
 * Do NOT introduce local-first or fire-and-forget alternatives.
 */
export async function mirrorToIRadius<T>(opts: {
	logTag: string;
	failureMessage: string;
	remote: () => Promise<unknown>;
	local: () => Promise<T>;
}): Promise<T> {
	try {
		await opts.remote();
	} catch (error) {
		logger.error(`${opts.logTag} failed`, {
			error: error instanceof Error ? error.message : error,
		});
		throw new ORPCError("INTERNAL_SERVER_ERROR", {
			message: opts.failureMessage,
		});
	}
	return opts.local();
}
