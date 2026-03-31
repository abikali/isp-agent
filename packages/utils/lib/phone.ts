/**
 * Normalize a phone number for WhatsApp delivery.
 * Preserves international prefixes; only defaults to Lebanon (961) for local numbers.
 */
export function normalizePhone(phone: string): string {
	// Strip leading '+' and all non-digit characters
	const digits = phone.replace(/\D/g, "");

	// Already has international prefix (starts with a country code)
	if (digits.length >= 10) {
		return digits;
	}

	// Local Lebanese number starting with 0 (e.g. 03123456 → 9613123456)
	if (digits.startsWith("0")) {
		return `961${digits.slice(1)}`;
	}

	// Short local number without leading 0 — assume Lebanese
	return `961${digits}`;
}
