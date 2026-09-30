/**
 * Billing filter fragments shared by `@repo/api` (billing module) and
 * `@repo/jobs` (expiry reminders), which cannot import `@repo/api`. The API's
 * `billing/lib/filters.ts` re-exports these, so both sides select "who owes"
 * with the same rules.
 */

/**
 * Exclude customers whose groupName matches a value (case-insensitive),
 * while keeping customers with NULL groupName.
 */
export function excludeGroupFilter(groupName: string) {
	return {
		OR: [
			{ groupName: null },
			{
				NOT: {
					groupName: {
						equals: groupName,
						mode: "insensitive" as const,
					},
				},
			},
		],
	};
}

/**
 * A "pending stopped" payment: collector flagged the customer as stopped,
 * admin has not yet approved or declined. While in this state, the customer
 * should be hidden from collector lists and shown in the admin review queue.
 */
export const PENDING_STOPPED_PAYMENT = {
	stoppedAccount: true,
	reviewedAt: null,
} as const;

/**
 * Customer statuses that should be collectible. Only ACTIVE customers are
 * billed, appear in collector lists, and count toward billing stats.
 * PENDING customers are excluded until their iRadius `Active` flag flips
 * back to 1 and their status is promoted to ACTIVE.
 */
export const BILLABLE_CUSTOMER_STATUSES = ["ACTIVE"] as const;
