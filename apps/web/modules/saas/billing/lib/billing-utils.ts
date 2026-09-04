/**
 * Shared billing utility functions to eliminate duplication
 * across billing components.
 */

import { getBeirutDate } from "@shared/lib/format";

// ─── Cycle Constants & Formatting ──────────────────────────────

const MONTH_SHORT = [
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

const MONTH_NAMES = [
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
	const today = getBeirutDate();

	const dbMap = new Map(dbCycles.map((c) => [`${c.year}-${c.month}`, c]));

	const options: CycleOption[] = [];

	for (let offset = -pastMonths; offset <= futureMonths; offset++) {
		const d = new Date(today.year, today.month - 1 + offset, 1);
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
): "default" | "destructive" | "warning" | "info" | "success" | "outline" {
	const flag = getPaymentFlagType(payment);
	if (flag === "stopped") {
		return "destructive";
	}
	if (flag === "free") {
		return "info";
	}
	if (flag === "debt") {
		return "warning";
	}
	if (flag === "overpaid") {
		return "success";
	}
	if (flag === "underpaid") {
		return "warning";
	}
	if (flag === "noted") {
		// No violet Badge variant exists; "outline" stays neutral and the
		// violet look is layered on via getPaymentFlagBadgeClassName so the
		// badge matches the violet row + legend.
		return "outline";
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
	if (flag === "debt") {
		return "Debt";
	}
	if (flag === "overpaid") {
		return "Overpaid";
	}
	if (flag === "underpaid") {
		return "Underpaid";
	}
	if (flag === "noted") {
		return "Noted";
	}
	return "Collected";
}

/**
 * Extra classes for the status badge when no Badge variant captures the flag
 * color. Currently only "noted" (violet) — keeps the badge in step with the
 * violet row border + legend. Returns undefined when the variant alone is
 * enough.
 */
export function getPaymentFlagBadgeClassName(
	payment: FlaggablePayment,
): string | undefined {
	if (getPaymentFlagType(payment) === "noted") {
		return "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400";
	}
	return undefined;
}

/**
 * Returns the badge variant for a payment's status. `debtAccount` is optional
 * so the older two-state call sites keep working, but pass it wherever the row
 * can be a debt: a debt visit collects nothing and must never read "Collected".
 */
export function getPaymentStatusVariant(
	stoppedAccount: boolean,
	debtAccount?: boolean,
): "default" | "destructive" | "warning" {
	if (stoppedAccount) {
		return "destructive";
	}
	return debtAccount ? "warning" : "default";
}

/** Returns the label for a payment based on stopped/debt status. */
export function getPaymentStatusLabel(
	stoppedAccount: boolean,
	debtAccount?: boolean,
): string {
	if (stoppedAccount) {
		return "Stopped";
	}
	return debtAccount ? "Debt" : "Collected";
}

// ─── Payment Flag Detection ──────────────────────────────────

export type PaymentFlagType =
	| "stopped"
	| "free"
	| "debt"
	| "overpaid"
	| "underpaid"
	| "noted";

interface FlaggablePayment {
	freeAccount: boolean;
	stoppedAccount: boolean;
	// Optional so payment shapes fetched before the debt feature still fit.
	debtAccount?: boolean;
	paidAmount: number;
	accountPrice: number;
	discount: number;
	noteCategory: string | null;
	notes: string | null;
	reviewedAt: string | Date | null;
	customer?: { iptvPrice?: number; realIpPrice?: number };
}

/**
 * Compute the expected total for a payment.
 * Includes IPTV and Real IP prices from the customer when available.
 */
function expectedTotal(payment: {
	accountPrice: number;
	discount: number;
	customer?: { iptvPrice?: number; realIpPrice?: number };
}): number {
	return (
		payment.accountPrice +
		(payment.customer?.iptvPrice ?? 0) +
		(payment.customer?.realIpPrice ?? 0) -
		payment.discount
	);
}

/** Whether the paid amount differs from the expected total. */
export function isAmountMismatch(payment: {
	paidAmount: number;
	accountPrice: number;
	discount: number;
	customer?: { iptvPrice?: number; realIpPrice?: number };
}): boolean {
	return Math.abs(payment.paidAmount - expectedTotal(payment)) > 0.01;
}

/** Determine the flag type for a payment, or null if normal. */
function getPaymentFlagType(payment: FlaggablePayment): PaymentFlagType | null {
	if (payment.stoppedAccount) {
		return "stopped";
	}
	if (payment.freeAccount) {
		return "free";
	}
	// Before the mismatch check: a debt row is always paidAmount 0, which
	// would otherwise read as "underpaid".
	if (payment.debtAccount) {
		return "debt";
	}
	if (isAmountMismatch(payment)) {
		return payment.paidAmount > expectedTotal(payment)
			? "overpaid"
			: "underpaid";
	}
	// A collector-attached note on an otherwise-normal collection still needs
	// an admin look. Lowest priority so the flags above keep their own color.
	if (payment.notes || payment.noteCategory) {
		return "noted";
	}
	return null;
}

/** Whether a payment needs admin review. */
export function isUnreviewed(payment: FlaggablePayment): boolean {
	return getPaymentFlagType(payment) !== null && !payment.reviewedAt;
}

/** Note categories that mean "the customer is moving to another plan". */
export const PLAN_CHANGE_CATEGORIES = new Set(["DOWNGRADE", "UPGRADE"]);

/**
 * An unreviewed cash collection whose amount differs from the frozen price.
 * The amount is usually not a shortfall but the price agreed at the door — a
 * plan move, a discount, a dropped add-on. Reviewing it means an admin
 * applies that pricing ("Adjust pricing & review") so the month is repriced,
 * not a bare "mark reviewed" that leaves the remainder owed.
 */
export function isRepriceCandidate(payment: FlaggablePayment): boolean {
	return (
		isUnreviewed(payment) &&
		!payment.stoppedAccount &&
		!payment.freeAccount &&
		!payment.debtAccount &&
		isAmountMismatch(payment)
	);
}

/**
 * A reprice candidate the collector explicitly tagged Downgrade / Upgrade:
 * the admin's job is picking the plan the customer asked for.
 */
export function isPlanChangeRequest(payment: FlaggablePayment): boolean {
	return (
		isRepriceCandidate(payment) &&
		!!payment.noteCategory &&
		PLAN_CHANGE_CATEGORIES.has(payment.noteCategory)
	);
}

const FLAG_ROW_CLASSES: Record<PaymentFlagType, string> = {
	stopped: "border-l-4 border-l-red-600 bg-red-100 dark:bg-red-950",
	free: "border-l-4 border-l-blue-600 bg-blue-100 dark:bg-blue-950",
	debt: "border-l-4 border-l-orange-600 bg-orange-100 dark:bg-orange-950",
	overpaid:
		"border-l-4 border-l-emerald-600 bg-emerald-100 dark:bg-emerald-950",
	underpaid: "border-l-4 border-l-amber-500 bg-amber-100 dark:bg-amber-950",
	noted: "border-l-4 border-l-violet-600 bg-violet-100 dark:bg-violet-950",
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
		return "border-l-4 border-l-muted-foreground/30 bg-muted/50";
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
	{ type: "debt", label: "Debt", className: "bg-orange-600" },
	{ type: "overpaid", label: "Overpaid", className: "bg-emerald-600" },
	{ type: "underpaid", label: "Underpaid", className: "bg-amber-500" },
	{ type: "noted", label: "Noted", className: "bg-violet-600" },
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
