/**
 * The monthly price a customer is charged once they sit on a plan — what
 * iRadius writes to `User.AccountPrice` on an account-type change. Prefer the
 * dealer's selling price, then the wholesale rate, then our own monthly price.
 * Shared so the plan-change paths (customer detail, payment review) agree.
 */
export function planMonthlyRate(plan: {
	sellingPrice: number | null;
	rate: number | null;
	monthlyPrice: number;
}): number {
	return plan.sellingPrice ?? plan.rate ?? plan.monthlyPrice;
}
