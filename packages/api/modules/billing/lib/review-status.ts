import { db, Prisma } from "@repo/database";

/**
 * Tolerance for the "expected vs paid" amount comparison. Currency amounts
 * round through Postgres/JS doubles; a 1-cent epsilon avoids false flags
 * from rounding noise while still catching real mismatches.
 */
const AMOUNT_EPSILON = 0.01;

/**
 * SQL for what a payment row was expected to collect. Aliases: `p` payment,
 * `c` customer, `inv` the payment's invoice (see `PAYMENT_INVOICE_JOIN_SQL`).
 *
 * The frozen invoice total is the unit of truth for collection: it is what
 * the customer owed when the month opened, and it stays put while the
 * customer's live pricing moves (a plan or discount edited mid-month, an
 * iRadius sync). The row's own `accountPrice` is the LIVE price the sheet
 * sent at collection, so comparing against it hides exactly the case the
 * review exists for — a customer moved to a cheaper plan after the invoice
 * froze pays the new price, the row reads as full, and the invoice stays
 * short. Rows without an invoice (addon-only, free-group) fall back to the
 * row math. Keep in step with the client `expectedTotal` in
 * apps/web/modules/saas/billing/lib/billing-utils.ts.
 */
export const PAYMENT_EXPECTED_TOTAL_SQL = `COALESCE(inv."total", p."accountPrice" + COALESCE(c."iptvPrice", 0) + COALESCE(c."realIpPrice", 0) - p."discount")`;
export const PAYMENT_INVOICE_JOIN_SQL = `LEFT JOIN "customer_invoice" inv ON inv.id = p."invoiceId" AND inv."voidedAt" IS NULL`;

/**
 * A payment is "flagged for review" when ANY of these are true:
 *   1. freeAccount = true   (admin marked it free of charge)
 *   2. stoppedAccount = true (collected from a stopped/suspended account)
 *   3. debtAccount = true    (zero-cash visit; the collector carried the
 *      customer, which `LENIENCY_NOTICE` promises the admin will review)
 *   4. paidAmount != the month's frozen invoice total (amount mismatch; see
 *      `PAYMENT_EXPECTED_TOTAL_SQL` for the no-invoice fallback)
 *   5. the collector attached a note (`notes` or `noteCategory` is set)
 *
 * Debt is listed explicitly even though a debt row always carries a mandatory
 * note and would therefore be caught by (5) anyway — relying on that coupling
 * made a deliberate product decision look accidental, and it would silently
 * break if the note ever became optional.
 *
 * Reviewing a debt means "seen, the carry is accepted"; it settles nothing and
 * the customer stays on the unpaid list. Surfaces that show a reviewed payment
 * must not imply the money arrived — see `getPaymentStatusLabel`.
 *
 * It is "unreviewed" when it is flagged AND `reviewedAt IS NULL`.
 *
 * Free/stopped/has-note are simple column predicates and can be expressed in
 * Prisma directly. The amount-mismatch case involves customer-joined
 * columns inside an arithmetic expression, which Prisma cannot express
 * without raw SQL — so we fetch the matching IDs first and feed them back
 * into a normal `where` clause.
 *
 * NOTE: cases 1–3 already require a note (see create-payment.ts), so those
 * rows always satisfy case 4 too. Case 4 alone adds the new path: a normal
 * collection (correct amount, not free/stopped) that the collector chose to
 * annotate. Keep this list in sync with the client-side `getPaymentFlagType`
 * in apps/web/modules/saas/billing/lib/billing-utils.ts.
 *
 * IMPORTANT: this is the *payment-side* "needs review" concept and is
 * distinct from the customer-side `CUSTOMER_NEEDS_REVIEW_WHERE` (which
 * means "customer has any non-empty admin note"). Do not conflate them.
 */

/**
 * Find IDs of unreviewed payments whose paid amount doesn't match the
 * expected total. Excludes free + stopped + debt payments (those are flagged
 * via their own boolean columns and don't need the expensive math). Debt in
 * particular is always paidAmount 0, which would otherwise read as a large
 * underpayment — the same ordering `getPaymentFlagType` applies client-side.
 */
export async function findUnreviewedAmountMismatchPaymentIds(args: {
	organizationId: string;
	activeDealerId: string | null;
	billingMonthId?: string | undefined;
}): Promise<string[]> {
	const { organizationId, activeDealerId, billingMonthId } = args;
	const invoiceJoin = Prisma.raw(PAYMENT_INVOICE_JOIN_SQL);
	const expected = Prisma.raw(PAYMENT_EXPECTED_TOTAL_SQL);
	const rows = billingMonthId
		? await db.$queryRaw<{ id: string }[]>`
				SELECT p.id FROM "payment" p
				JOIN "customer" c ON c.id = p."customerId"
				${invoiceJoin}
				WHERE p."organizationId" = ${organizationId}
				  AND c."dealerId" IS NOT DISTINCT FROM ${activeDealerId}
				  AND p."billingCycleId" = ${billingMonthId}
				  AND p."freeAccount" = false
				  AND p."stoppedAccount" = false
				  AND p."debtAccount" = false
				  AND p."reviewedAt" IS NULL
				  AND ABS(p."paidAmount" - ${expected}) > ${AMOUNT_EPSILON}
			`
		: await db.$queryRaw<{ id: string }[]>`
				SELECT p.id FROM "payment" p
				JOIN "customer" c ON c.id = p."customerId"
				${invoiceJoin}
				WHERE p."organizationId" = ${organizationId}
				  AND c."dealerId" IS NOT DISTINCT FROM ${activeDealerId}
				  AND p."freeAccount" = false
				  AND p."stoppedAccount" = false
				  AND p."debtAccount" = false
				  AND p."reviewedAt" IS NULL
				  AND ABS(p."paidAmount" - ${expected}) > ${AMOUNT_EPSILON}
			`;
	return rows.map((r) => r.id);
}

/**
 * Prisma `where` fragment for "this payment needs admin review":
 *   reviewedAt IS NULL AND (freeAccount OR stoppedAccount OR debtAccount
 *                           OR notes set OR noteCategory set
 *                           OR id IN mismatchIds)
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
		| { debtAccount: true }
		| { notes: { not: null } }
		| { noteCategory: { not: null } }
		| { id: { in: string[] } }
	>;
} {
	return {
		reviewedAt: null,
		OR: [
			{ freeAccount: true },
			{ stoppedAccount: true },
			{ debtAccount: true },
			{ notes: { not: null } },
			{ noteCategory: { not: null } },
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
