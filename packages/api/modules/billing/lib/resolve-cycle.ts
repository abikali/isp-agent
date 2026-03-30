/**
 * Shared cycle resolution logic — eliminates duplication across billing procedures.
 */

import { db } from "@repo/database";

/**
 * Resolve the active billing cycle ID for an organization.
 * Returns undefined if no cycle row exists yet.
 */
export async function resolveBillingCycleId(
	organizationId: string,
	activeBillingYear: number | null | undefined,
	activeBillingMonth: number | null | undefined,
): Promise<string | undefined> {
	const now = new Date();
	const year = activeBillingYear ?? now.getFullYear();
	const month = activeBillingMonth ?? now.getMonth() + 1;

	const cycle = await db.billingCycle.findUnique({
		where: {
			organizationId_year_month: { organizationId, year, month },
		},
		select: { id: true },
	});
	return cycle?.id;
}

/**
 * Resolve or create the active billing cycle.
 * Used by create-payment and current-cycle where auto-creation is desired.
 */
export async function resolveOrCreateBillingCycle(
	organizationId: string,
	activeBillingYear: number | null | undefined,
	activeBillingMonth: number | null | undefined,
) {
	const now = new Date();
	const year = activeBillingYear ?? now.getFullYear();
	const month = activeBillingMonth ?? now.getMonth() + 1;

	return db.billingCycle.upsert({
		where: {
			organizationId_year_month: { organizationId, year, month },
		},
		update: {},
		create: { organizationId, year, month, status: "OPEN" },
	});
}

/**
 * Derive a month date range from a billing cycle's year/month.
 */
export function getCycleDateRange(year: number, month: number) {
	return {
		gte: new Date(year, month - 1, 1),
		lte: new Date(year, month, 0, 23, 59, 59, 999),
	};
}
