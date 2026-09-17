import {
	beirutWallClockToUtc,
	formatDateInput,
	formatDateTimeLocalInput,
} from "@shared/lib/format";

/** Saved values of a pending setup request that the price fields edit. */
export interface SetupRequestSaved {
	discount: number;
	iptvPrice: number;
	realIpPrice: number;
	firstChargeAmount: number;
	expiresAt: Date | string | null;
}

/** Raw dialog inputs (strings, as `<input>` holds them). */
export interface SetupRequestForm {
	discount: string;
	iptvPrice: string;
	realIpPrice: string;
	firstCharge: string;
	/** `YYYY-MM-DD` (Beirut calendar day), or "" for no change. */
	expiresAt: string;
}

export interface SetupRequestPricePatch {
	discount?: number;
	iptvPrice?: number;
	realIpPrice?: number;
	firstChargeAmount?: number;
	expiresAt?: Date;
}

export type BuildPatchResult =
	| { ok: true; patch: SetupRequestPricePatch }
	| { ok: false; error: string };

const PRICE_FIELDS = [
	{ form: "discount", saved: "discount", label: "Discount" },
	{ form: "iptvPrice", saved: "iptvPrice", label: "IPTV price" },
	{ form: "realIpPrice", saved: "realIpPrice", label: "Real IP price" },
	{ form: "firstCharge", saved: "firstChargeAmount", label: "First charge" },
] as const;

/** Round to cents so float noise never reads as a change. */
function cents(value: number): number {
	return Math.round(value * 100) / 100;
}

/** Parse a money input: empty → 0, negative/non-numeric → null. */
export function parseMoneyInput(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed === "") {
		return 0;
	}
	const value = Number(trimmed);
	return Number.isFinite(value) && value >= 0 ? cents(value) : null;
}

/**
 * What iRadius invoices for the subscription itself in the first month:
 * the account price net of the discount. Add-ons are collected on their own
 * install lines, so they are not part of this figure.
 */
export function firstMonthBill(monthlyRate: number, discount: number): number {
	return Math.max(0, cents(monthlyRate - discount));
}

/**
 * The price/expiry part of the "Edit Before Approval" save. Only fields whose
 * value actually changed are included (an explicit 0 is a change), so saving
 * an untouched dialog never rewrites stored prices or the expiry timestamp.
 *
 * A changed expiry date keeps the saved Beirut time-of-day — a bare
 * `new Date("YYYY-MM-DD")` would move the expiry to 00:00 UTC.
 */
export function buildSetupRequestPatch(
	saved: SetupRequestSaved,
	form: SetupRequestForm,
): BuildPatchResult {
	const patch: SetupRequestPricePatch = {};
	for (const field of PRICE_FIELDS) {
		const value = parseMoneyInput(form[field.form]);
		if (value === null) {
			return {
				ok: false,
				error: `${field.label} must be a number of 0 or more`,
			};
		}
		if (value !== cents(saved[field.saved])) {
			patch[field.saved] = value;
		}
	}

	const savedDate = saved.expiresAt ? formatDateInput(saved.expiresAt) : "";
	if (form.expiresAt && form.expiresAt !== savedDate) {
		const time = saved.expiresAt
			? formatDateTimeLocalInput(saved.expiresAt).slice(11)
			: "00:00";
		const expiresAt = beirutWallClockToUtc(`${form.expiresAt}T${time}`);
		if (Number.isNaN(expiresAt.getTime())) {
			return { ok: false, error: "Expiry date is invalid" };
		}
		patch.expiresAt = expiresAt;
	}

	return { ok: true, patch };
}
