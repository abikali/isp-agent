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
 * Build a phones array from raw mobile/phone strings (for iRadius sync).
 * Handles comma-separated phone values.
 */
export function buildPhonesFromSync(
	mobile: string | null,
	phone: string | null,
): CustomerPhone[] {
	const phones: CustomerPhone[] = [];
	const seen = new Set<string>();

	if (mobile) {
		phones.push({ number: mobile, primary: true });
		seen.add(mobile);
	}

	if (phone) {
		const numbers = phone
			.split(",")
			.map((p) => p.trim())
			.filter(Boolean);
		for (const num of numbers) {
			if (!seen.has(num)) {
				phones.push({ number: num, primary: phones.length === 0 });
				seen.add(num);
			}
		}
	}

	return phones.slice(0, MAX_PHONES);
}
