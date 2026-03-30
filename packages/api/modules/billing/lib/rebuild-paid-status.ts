/**
 * Centralized logic for rebuilding the `paidCurrentCycle` flag on customers.
 *
 * This flag is denormalized — it can be derived from Payment records.
 * Every code path that manipulates billing cycles (close, reopen, set-active,
 * sync reconciliation) MUST use this function to keep it consistent.
 *
 * A customer is considered "paid" if:
 *   1. They have a non-stopped payment (PENDING, PARTIAL, or PROCESSED) in the cycle, OR
 *   2. Their subscription `expiresAt` extends past the billing period end date
 */

import type { db } from "@repo/database";

/** The subset of PrismaClient methods needed — works with both `db` and transaction clients. */
type PrismaLike = Pick<typeof db, "customer" | "payment" | "billingCycle">;

interface RebuildResult {
	reset: number;
	restored: number;
}

/**
 * Rebuild `paidCurrentCycle` from actual payment records for a given billing cycle.
 *
 * @param tx - Prisma client or transaction client
 * @param organizationId - Organization to rebuild for
 * @param billingCycleId - The cycle to check payments against
 * @param dealerId - Dealer scope filter. When provided, only that dealer's customers
 *   are affected. When omitted, ALL customers in the org are rebuilt (used by sync).
 */
export async function rebuildPaidCurrentCycle(
	tx: PrismaLike,
	organizationId: string,
	billingCycleId: string,
	dealerId?: string,
): Promise<RebuildResult> {
	const dealerFilter = dealerId ? { dealerId } : {};
	const customerDealerFilter = dealerId ? { customer: { dealerId } } : {};

	// 1. Reset customers to unpaid
	const resetResult = await tx.customer.updateMany({
		where: {
			organizationId,
			paidCurrentCycle: true,
			...dealerFilter,
		},
		data: { paidCurrentCycle: false },
	});

	// 2. Find customers with non-stopped payments in this cycle
	const paidRows = await tx.payment.findMany({
		where: {
			billingCycleId,
			organizationId,
			stoppedAccount: false,
			status: { in: ["PENDING", "PARTIAL", "PROCESSED"] },
			...customerDealerFilter,
		},
		select: { customerId: true },
		distinct: ["customerId"],
	});

	if (paidRows.length > 0) {
		await tx.customer.updateMany({
			where: { id: { in: paidRows.map((p) => p.customerId) } },
			data: { paidCurrentCycle: true },
		});
	}

	// 3. Mark customers whose expiry extends past the billing period
	const cycle = await tx.billingCycle.findUnique({
		where: { id: billingCycleId },
		select: { year: true, month: true },
	});

	let expiryCount = 0;
	if (cycle) {
		const billingPeriodEnd = new Date(cycle.year, cycle.month, 1);
		const expiryResult = await tx.customer.updateMany({
			where: {
				organizationId,
				paidCurrentCycle: false,
				status: "ACTIVE",
				expiresAt: { gte: billingPeriodEnd },
				...dealerFilter,
			},
			data: { paidCurrentCycle: true },
		});
		expiryCount = expiryResult.count;
	}

	return {
		reset: resetResult.count,
		restored: paidRows.length + expiryCount,
	};
}
