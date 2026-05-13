import { db } from "@repo/database";

/**
 * Tolerance for the "expected vs paid" amount comparison. Currency amounts
 * round through Postgres/JS doubles; a 1-cent epsilon avoids false flags
 * from rounding noise while still catching real mismatches.
 */
const AMOUNT_EPSILON = 0.01;

/**
 * A payment is "flagged for review" when ANY of these are true:
 *   1. freeAccount = true   (admin marked it free of charge)
 *   2. stoppedAccount = true (collected from a stopped/suspended account)
 *   3. paidAmount != accountPrice + iptv + realIp - discount (amount mismatch)
 *
 * It is "unreviewed" when it is flagged AND `reviewedAt IS NULL`.
 *
 * Free/stopped flags are simple column predicates and can be expressed in
 * Prisma directly. The amount-mismatch case involves customer-joined
 * columns inside an arithmetic expression, which Prisma cannot express
 * without raw SQL — so we fetch the matching IDs first and feed them back
 * into a normal `where` clause.
 *
 * IMPORTANT: this is the *payment-side* "needs review" concept and is
 * distinct from the customer-side `CUSTOMER_NEEDS_REVIEW_WHERE` (which
 * means "customer has any non-empty admin note"). Do not conflate them.
 */

/**
 * Find IDs of unreviewed payments whose paid amount doesn't match the
 * expected total. Excludes free + stopped payments (those are flagged via
 * their own boolean columns and don't need the expensive math).
 */
export async function findUnreviewedAmountMismatchPaymentIds(args: {
	organizationId: string;
	activeDealerId: string | null;
	billingMonthId?: string | undefined;
}): Promise<string[]> {
	const { organizationId, activeDealerId, billingMonthId } = args;
	const rows = billingMonthId
		? await db.$queryRaw<{ id: string }[]>`
				SELECT p.id FROM "payment" p
				JOIN "customer" c ON c.id = p."customerId"
				WHERE p."organizationId" = ${organizationId}
				  AND c."dealerId" IS NOT DISTINCT FROM ${activeDealerId}
				  AND p."billingCycleId" = ${billingMonthId}
				  AND p."freeAccount" = false
				  AND p."stoppedAccount" = false
				  AND p."reviewedAt" IS NULL
				  AND ABS(p."paidAmount" - (p."accountPrice" + COALESCE(c."iptvPrice", 0) + COALESCE(c."realIpPrice", 0) - p."discount")) > ${AMOUNT_EPSILON}
			`
		: await db.$queryRaw<{ id: string }[]>`
				SELECT p.id FROM "payment" p
				JOIN "customer" c ON c.id = p."customerId"
				WHERE p."organizationId" = ${organizationId}
				  AND c."dealerId" IS NOT DISTINCT FROM ${activeDealerId}
				  AND p."freeAccount" = false
				  AND p."stoppedAccount" = false
				  AND p."reviewedAt" IS NULL
				  AND ABS(p."paidAmount" - (p."accountPrice" + COALESCE(c."iptvPrice", 0) + COALESCE(c."realIpPrice", 0) - p."discount")) > ${AMOUNT_EPSILON}
			`;
	return rows.map((r) => r.id);
}

/**
 * Prisma `where` fragment for "this payment needs admin review":
 *   reviewedAt IS NULL AND (freeAccount OR stoppedAccount OR id IN mismatchIds)
 *
 * Compose with caller-specific `baseWhere` (org/dealer/month/collector
 * scope). Pass the mismatch IDs returned by
 * `findUnreviewedAmountMismatchPaymentIds`.
 */
export function unreviewedPaymentsWhereFragment(
	mismatchIds: readonly string[],
): {
	reviewedAt: null;
	OR: Array<
		| { freeAccount: true }
		| { stoppedAccount: true }
		| { id: { in: string[] } }
	>;
} {
	return {
		reviewedAt: null,
		OR: [
			{ freeAccount: true },
			{ stoppedAccount: true },
			...(mismatchIds.length > 0
				? [{ id: { in: [...mismatchIds] } }]
				: []),
		],
	};
}

/**
 * Count unreviewed flagged payments under the given org/dealer/month scope.
 * Single source of truth — wraps the mismatch-ID query + the Prisma count
 * so the dashboard stat and "needs review" filter list agree exactly.
 *
 * `extraWhere` lets callers narrow further (e.g. by collector for the
 * own-scope billing stats).
 */
export async function countUnreviewedPayments(args: {
	organizationId: string;
	activeDealerId: string | null;
	billingMonthId?: string | undefined;
	extraWhere?: Record<string, unknown>;
}): Promise<number> {
	const {
		organizationId,
		activeDealerId,
		billingMonthId,
		extraWhere = {},
	} = args;
	const mismatchIds = await findUnreviewedAmountMismatchPaymentIds({
		organizationId,
		activeDealerId,
		billingMonthId,
	});
	return db.payment.count({
		where: {
			organizationId,
			...(billingMonthId ? { billingMonthId } : {}),
			...extraWhere,
			...unreviewedPaymentsWhereFragment(mismatchIds),
		},
	});
}
