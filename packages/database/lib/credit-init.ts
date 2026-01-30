/**
 * AI Credit Initialization (deprecated - AI features removed)
 *
 * These functions are kept as no-ops to avoid breaking payment provider integrations.
 */

export async function initializeCredits(
	_organizationId: string,
	_monthlyAllocation: number,
): Promise<void> {
	// No-op: AI credit system removed
}

export async function addPurchasedCredits(
	_organizationId: string,
	_credits: number,
	_purchaseId: string,
): Promise<boolean> {
	// No-op: AI credit system removed
	return false;
}
