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
	const normalized = digits.startsWith("961")
		? digits
		: digits.startsWith("0")
			? `961${digits.slice(1)}`
			: `961${digits}`;
	return `https://wa.me/${normalized}`;
}

export function formatWhatsAppReceiptLink(
	phone: string | null | undefined,
	customerName: string,
	amount: number,
): string | null {
	const baseLink = formatWhatsAppLink(phone);
	if (!baseLink) {
		return null;
	}
	const message = `Thank you ${customerName}! Payment of $${amount.toFixed(2)} received.`;
	return `${baseLink}?text=${encodeURIComponent(message)}`;
}
