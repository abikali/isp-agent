/**
 * "Needs review" for a customer means the row has any non-empty admin note.
 *
 * This is a SOFT ANNOTATION concept — distinct from the payment-side
 * "needs review" workflow flag (see `packages/api/modules/billing/lib/
 * review-status.ts`), which marks payments awaiting explicit admin
 * approval (free / stopped / amount mismatch + reviewedAt IS NULL).
 *
 * Importing this constant from every call site keeps the predicate
 * consistent across the customers list, the customer stats card, and the
 * marketing-audience filter.
 */
export const CUSTOMER_NEEDS_REVIEW_WHERE = {
	notes: { not: "" },
} as const;
