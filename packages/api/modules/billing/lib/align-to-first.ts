import { beirutParts } from "@repo/utils";
import { round2 } from "../../dealers/lib/ledger";

/**
 * "Align billing to the 1st" — pure pieces shared by the preview, the action
 * and the tests. The iRadius side (moving the expiry, charging the dealer)
 * lives in `customers/lib/iradius-extra-time.ts`.
 */

/**
 * The 1st the expiry should land on (`YYYY-MM-DD`, 23:59 Beirut implied):
 * the 1st of the month after `base`, or `base`'s own day when it already is
 * a 1st (elsyaon: base 10-01 12:06 → 10-01, 0 days).
 */
export function alignTarget(base: Date): string {
	const { year, month, day } = beirutParts(base);
	const pad = (n: number) => String(n).padStart(2, "0");
	if (day === 1) {
		return `${year}-${pad(month)}-01`;
	}
	return month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
}

export interface Proration {
	/** monthlyDue × days / periodDays, to the cent. */
	formulaAmount: number;
	/** What the dialog proposes: whole dollars, or what was actually collected when that is within $1. */
	suggestedAmount: number;
}

/**
 * The customer's price for `days` of service. `periodDays` is the same
 * denominator iRadius uses for the dealer (periodHours / 24), so the retail
 * and wholesale sides move in lockstep. 25 × 10 / 30 = 8.33 → $8.
 */
export function prorate(
	monthlyDue: number,
	days: number,
	periodDays: number,
	paidAmount?: number | null,
): Proration {
	const formulaAmount =
		periodDays > 0 && days > 0
			? round2((monthlyDue * days) / periodDays)
			: 0;
	const suggestedAmount =
		paidAmount != null &&
		paidAmount > 0 &&
		Math.abs(paidAmount - formulaAmount) <= 1
			? paidAmount
			: Math.round(formulaAmount);
	return { formulaAmount, suggestedAmount };
}

/** The (year, month) after the given one. */
export function nextYearMonth(
	year: number,
	month: number,
): { year: number; month: number } {
	return month === 12
		? { year: year + 1, month: 1 }
		: { year, month: month + 1 };
}
