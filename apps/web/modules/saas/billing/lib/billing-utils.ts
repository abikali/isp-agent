/**
 * Shared billing utility functions to eliminate duplication
 * across billing components.
 */

import { PaymentStatus } from "@repo/database/enums";

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

interface CustomerForBilling {
	monthlyRate?: number | null;
	plan?: { monthlyPrice?: number | null } | null;
	iptvPrice?: number | null;
	realIpPrice?: number | null;
	discount?: number | null;
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

/** Human-readable labels for payment statuses. */
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
	[PaymentStatus.COLLECTED]: "Collected",
	[PaymentStatus.STOPPED]: "Stopped",
};

/** Returns the badge variant for a given payment status. */
export function getPaymentStatusVariant(
	status: PaymentStatus,
): "default" | "destructive" | "outline" | "secondary" {
	switch (status) {
		case PaymentStatus.COLLECTED:
			return "default";
		case PaymentStatus.STOPPED:
			return "destructive";
		default:
			return "secondary";
	}
}

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
