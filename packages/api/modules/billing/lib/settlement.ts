/**
 * Settlement lives in `@repo/database` now so the AI package (which cannot
 * import `@repo/api`) derives paid / partial / unpaid with the same rules as
 * billing. This shim keeps every existing import path working.
 */
export {
	AMOUNT_EPSILON,
	addCoverage,
	COVERING_PAYMENT,
	coverageKey,
	fetchCoverageMap,
	invoiceAmount,
	LEGACY_SETTLEMENT_CUTOFF,
	type MonthCoverage,
	monthRemaining,
	monthSettled,
} from "@repo/database/settlement";
