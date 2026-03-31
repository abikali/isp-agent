/**
 * Shared billing utility functions to eliminate duplication
 * across billing components.
 */

// ─── Cycle Constants & Formatting ──────────────────────────────

export const MONTH_SHORT = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
] as const;

export const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
] as const;

/** Format a cycle as "Apr 2026" */
export function formatCycleShort(year: number, month: number): string {
	return `${MONTH_SHORT[month - 1]} ${year}`;
}

/** Format a cycle as "April 2026" */
export function formatCycleLong(year: number, month: number): string {
	return `${MONTH_NAMES[month - 1]} ${year}`;
}

// ─── Cycle Options Builder ─────────────────────────────────────

export interface CycleOption {
	/** cycle.id for real DB records, or "YYYY-MM" for virtual months */
	value: string;
	year: number;
	month: number;
	label: string;
	/** Whether a BillingCycle row exists in the DB */
	exists: boolean;
}

/**
 * Merge real DB cycles with a generated range so the dropdown
 * always shows reasonable history (default: 6 past + 1 future month).
 */
export function buildCycleOptions(
	dbCycles: Array<{ id: string; year: number; month: number }>,
	opts?: { pastMonths?: number; futureMonths?: number },
): CycleOption[] {
	const pastMonths = opts?.pastMonths ?? 6;
	const futureMonths = opts?.futureMonths ?? 1;
	const now = new Date();

	const dbMap = new Map(dbCycles.map((c) => [`${c.year}-${c.month}`, c]));

	const options: CycleOption[] = [];

	for (let offset = -pastMonths; offset <= futureMonths; offset++) {
		const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
		const year = d.getFullYear();
		const month = d.getMonth() + 1;
		const key = `${year}-${month}`;
		const db = dbMap.get(key);
		options.push({
			value: db?.id ?? key,
			year,
			month,
			label: formatCycleShort(year, month),
			exists: !!db,
		});
		dbMap.delete(key);
	}

	// Include any DB cycles outside the generated range
	for (const [, c] of dbMap) {
		options.push({
			value: c.id,
			year: c.year,
			month: c.month,
			label: formatCycleShort(c.year, c.month),
			exists: true,
		});
	}

	options.sort((a, b) => b.year - a.year || b.month - a.month);
	return options;
}

// ─── Payment Utilities ─────────────────────────────────────────

export interface CustomerForBilling {
	monthlyRate?: number | null;
	plan?: { monthlyPrice?: number | null } | null;
	iptvPrice?: number | null;
	realIpPrice?: number | null;
	discount?: number | null;
}

/** Extracted price components for a customer. */
export interface PriceComponents {
	accountPrice: number;
	iptvPrice: number;
	realIpPrice: number;
	discountAmount: number;
}

/** Extract individual price components from a customer object. */
export function extractPriceComponents(
	customer: CustomerForBilling | null | undefined,
): PriceComponents {
	return {
		accountPrice:
			customer?.monthlyRate ?? customer?.plan?.monthlyPrice ?? 0,
		iptvPrice: customer?.iptvPrice ?? 0,
		realIpPrice: customer?.realIpPrice ?? 0,
		discountAmount: customer?.discount ?? 0,
	};
}

/**
 * Calculate total amount due considering free account flag and multi-month debt.
 * This is the single source of truth for totalDue in the frontend.
 */
export function calculateTotalDue(
	customer: CustomerForBilling & {
		accumulatedDue?: number | null;
		unpaidMonths?: number | null;
	},
	opts: { freeAccount: boolean },
): number {
	const { iptvPrice, realIpPrice } = extractPriceComponents(customer);
	const unpaidMonths = customer.unpaidMonths ?? 1;

	if (opts.freeAccount) {
		return (iptvPrice + realIpPrice) * unpaidMonths;
	}

	return customer.accumulatedDue ?? customerMonthlyDue(customer);
}

/** Parse a string amount to a number, defaulting to 0 on invalid input. */
export function parseAmount(value: string): number {
	return Number.parseFloat(value) || 0;
}

/**
 * Calculate total amount due for a customer based on their plan, addons, and discount.
 * Formula must stay in sync with the backend `customerMonthlyDue` in
 * packages/api/modules/billing/lib/calculations.ts.
 */
export function customerMonthlyDue(customer: CustomerForBilling): number {
	const accountPrice =
		customer.monthlyRate ?? customer.plan?.monthlyPrice ?? 0;
	return (
		accountPrice +
		(customer.iptvPrice ?? 0) +
		(customer.realIpPrice ?? 0) -
		(customer.discount ?? 0)
	);
}

/** Human-readable labels for payment note categories. */
export const NOTE_CATEGORY_LABELS: Record<string, string> = {
	DOWNGRADE: "Downgrade",
	UPGRADE: "Upgrade",
	DISCOUNT: "Discount",
	REFERRAL: "Referral",
	MOVED: "Moved",
	POOR_SERVICE: "Poor Service",
	CANT_PAY: "Can't Pay",
	TEMP_STOP: "Temp Stop",
};

/** Returns the badge variant for the payment flag type. */
export function getPaymentFlagVariant(
	payment: FlaggablePayment,
): "default" | "destructive" | "warning" | "info" | "success" {
	const flag = getPaymentFlagType(payment);
	if (flag === "stopped") {
		return "destructive";
	}
	if (flag === "free") {
		return "info";
	}
	if (flag === "overpaid") {
		return "success";
	}
	if (flag === "underpaid") {
		return "warning";
	}
	return "default";
}

/** Returns the display label for a payment's flag/status. */
export function getPaymentFlagLabel(payment: FlaggablePayment): string {
	const flag = getPaymentFlagType(payment);
	if (flag === "stopped") {
		return "Stopped";
	}
	if (flag === "free") {
		return "Free";
	}
	if (flag === "overpaid") {
		return "Overpaid";
	}
	if (flag === "underpaid") {
		return "Underpaid";
	}
	return "Collected";
}

/** Returns the badge variant based on whether the account was stopped. */
export function getPaymentStatusVariant(
	stoppedAccount: boolean,
): "default" | "destructive" {
	return stoppedAccount ? "destructive" : "default";
}

/** Returns the label for a payment based on stopped status. */
export function getPaymentStatusLabel(stoppedAccount: boolean): string {
	return stoppedAccount ? "Stopped" : "Collected";
}

// ─── Payment Flag Detection ──────────────────────────────────

export type PaymentFlagType = "stopped" | "free" | "overpaid" | "underpaid";

interface FlaggablePayment {
	freeAccount: boolean;
	stoppedAccount: boolean;
	paidAmount: number;
	accountPrice: number;
	discount: number;
	noteCategory: string | null;
	reviewedAt: string | Date | null;
}

/** Whether the paid amount differs from what was expected (accountPrice - discount). */
export function isAmountMismatch(payment: {
	paidAmount: number;
	accountPrice: number;
	discount: number;
}): boolean {
	const expected = payment.accountPrice - payment.discount;
	return Math.abs(payment.paidAmount - expected) > 0.01;
}

/** Determine the flag type for a payment, or null if normal. */
export function getPaymentFlagType(
	payment: FlaggablePayment,
): PaymentFlagType | null {
	if (payment.stoppedAccount) {
		return "stopped";
	}
	if (payment.freeAccount) {
		return "free";
	}
	if (isAmountMismatch(payment)) {
		const expected = payment.accountPrice - payment.discount;
		return payment.paidAmount > expected ? "overpaid" : "underpaid";
	}
	return null;
}

/** Whether a payment needs admin review. */
export function isUnreviewed(payment: FlaggablePayment): boolean {
	return getPaymentFlagType(payment) !== null && !payment.reviewedAt;
}

const FLAG_ROW_CLASSES: Record<PaymentFlagType, string> = {
	stopped: "border-l-4 border-l-red-600 bg-red-100 dark:bg-red-950",
	free: "border-l-4 border-l-blue-600 bg-blue-100 dark:bg-blue-950",
	overpaid:
		"border-l-4 border-l-emerald-600 bg-emerald-100 dark:bg-emerald-950",
	underpaid:
		"border-l-4 border-l-orange-500 bg-orange-100 dark:bg-orange-950",
};

/** Row className for a flagged payment (unreviewed gets color, reviewed gets faint). */
export function getPaymentRowClassName(
	payment: FlaggablePayment,
): string | undefined {
	const flag = getPaymentFlagType(payment);
	if (!flag) {
		return undefined;
	}
	if (payment.reviewedAt) {
		return "opacity-60";
	}
	return FLAG_ROW_CLASSES[flag];
}

export const FLAG_LEGEND: {
	type: PaymentFlagType;
	label: string;
	className: string;
}[] = [
	{ type: "stopped", label: "Stopped", className: "bg-red-600" },
	{ type: "free", label: "Free", className: "bg-blue-600" },
	{ type: "overpaid", label: "Overpaid", className: "bg-emerald-600" },
	{ type: "underpaid", label: "Underpaid", className: "bg-orange-500" },
];

/** Expiry status information for a customer account. */
export interface ExpiryInfo {
	diffDays: number;
	label: string;
	variant: "destructive" | "secondary" | "outline";
}

/** Compute expiry status (days remaining, label, badge variant) from an expiry date. */
export function getExpiryInfo(expiresAt: string | Date | null): ExpiryInfo {
	if (!expiresAt) {
		return { diffDays: 0, label: "No expiry", variant: "secondary" };
	}

	const date = new Date(expiresAt);
	const now = new Date();
	const diffDays = Math.ceil(
		(date.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffDays < 0) {
		return {
			diffDays,
			label: `${Math.abs(diffDays)}d overdue`,
			variant: "destructive",
		};
	}
	if (diffDays === 0) {
		return { diffDays, label: "Today", variant: "destructive" };
	}
	if (diffDays <= 7) {
		return { diffDays, label: `${diffDays}d left`, variant: "secondary" };
	}
	return { diffDays, label: "", variant: "outline" };
}
