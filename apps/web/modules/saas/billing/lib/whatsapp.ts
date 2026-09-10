export function formatWhatsAppLink(
	phone: string | null | undefined,
): string | null {
	if (!phone) {
		return null;
	}
	const digits = phone.replace(/\D/g, "");
	if (!digits) {
		return null;
	}
	// Lebanese numbers are 7–8 digits, optionally with a leading 0. Anything
	// longer already carries its own country code (Syrian, Iraqi, European
	// numbers are common among subscribers) and must not be prefixed again.
	const normalized = digits.startsWith("961")
		? digits
		: digits.startsWith("0") && digits.length <= 9
			? `961${digits.slice(1)}`
			: digits.length <= 8
				? `961${digits}`
				: digits;
	return `https://wa.me/${normalized}`;
}
