/**
 * Structured phone number entry stored in Customer.phones JSON field.
 * The `primary` phone is used for WhatsApp receipts and is cached in Customer.mobile.
 */
export interface CustomerPhone {
	number: string;
	primary: boolean;
}

export const MAX_PHONES = 5;

/** Parse the phones JSON field into a typed array. */
export function parsePhones(phones: unknown): CustomerPhone[] {
	if (!Array.isArray(phones)) {
		return [];
	}
	return phones.filter(
		(p): p is CustomerPhone =>
			typeof p === "object" &&
			p !== null &&
			typeof p.number === "string" &&
			typeof p.primary === "boolean",
	);
}

/** Get the primary phone number from a phones array. */
export function getPrimaryPhone(phones: unknown): string | null {
	const parsed = parsePhones(phones);
	const primary = parsed.find((p) => p.primary);
	return primary?.number ?? parsed[0]?.number ?? null;
}

/**
 * Normalize a Lebanese phone number to international format (+961...).
 * Handles local formats like 03609014 → +9613609014, 70302582 → +96170302582.
 */
export function normalizeLebanesePhone(raw: string): string {
	const digits = raw.replace(/[^0-9+]/g, "");
	if (digits.startsWith("+961")) {
		return digits;
	}
	if (digits.startsWith("961") && digits.length > 9) {
		return `+${digits}`;
	}
	if (digits.startsWith("0") && digits.length >= 8) {
		return `+961${digits.slice(1)}`;
	}
	if (/^[1-9]\d{6,7}$/.test(digits)) {
		return `+961${digits}`;
	}
	return raw;
}

/**
 * Build a phones array from raw mobile/phone strings (for iRadius sync).
 * Handles comma-separated phone values and normalizes to +961 format.
 */
export function buildPhonesFromSync(
	mobile: string | null,
	phone: string | null,
): CustomerPhone[] {
	const phones: CustomerPhone[] = [];
	const seen = new Set<string>();

	if (mobile) {
		const normalized = normalizeLebanesePhone(mobile);
		phones.push({ number: normalized, primary: true });
		seen.add(normalized);
	}

	if (phone) {
		const numbers = phone
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);
		for (const num of numbers) {
			const normalized = normalizeLebanesePhone(num);
			if (!seen.has(normalized)) {
				phones.push({
					number: normalized,
					primary: phones.length === 0,
				});
				seen.add(normalized);
			}
		}
	}

	return phones.slice(0, MAX_PHONES);
}
