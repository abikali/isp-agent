/**
 * Helpers for the "Review stopped payment" task lifecycle.
 *
 * The task is created in `create-payment.ts` when a collector flags a stop;
 * it lives until admin approves (review-payment), declines (decline), or
 * the customer is reactivated (reactivate). All three closure paths use
 * `closeReviewTasksForCustomer` so the title-prefix match stays in one place.
 */

import { db } from "@repo/database";
import { logger } from "@repo/logs";

export const REVIEW_STOPPED_TASK_TITLE_PREFIX = "Review stopped payment:";

/**
 * Fire-and-forget: task lifecycle is a UX hint, not a hard dependency.
 * Failure is logged and swallowed.
 */
export async function closeReviewTasksForCustomer(
	organizationId: string,
	customerId: string,
): Promise<void> {
	try {
		await db.task.updateMany({
			where: {
				organizationId,
				customerId,
				status: "OPEN",
				title: { startsWith: REVIEW_STOPPED_TASK_TITLE_PREFIX },
			},
			data: {
				status: "COMPLETED",
				completedAt: new Date(),
			},
		});
	} catch (err) {
		logger.warn("[Stopped Payment] Failed to close review task", {
			customerId,
			error: String(err),
		});
	}
}
