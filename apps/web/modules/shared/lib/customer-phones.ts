/**
 * Every number we hold for a customer, primary first and de-duplicated.
 *
 * `Customer.phones` is the authoritative list (JSON `[{ number, primary }]`);
 * the legacy `mobile` / `phone` columns are only a fallback for rows that
 * predate it or for queries that didn't select `phones`.
 */
export interface CustomerPhoneSource {
	phones?: unknown;
	mobile?: string | null | undefined;
	phone?: string | null | undefined;
}

export function customerPhoneNumbers(
	customer: CustomerPhoneSource | null | undefined,
): string[] {
	if (!customer) {
		return [];
	}

	const ordered: string[] = [];
	const seenDigits: string[] = [];
	const push = (raw: string | null | undefined) => {
		const number = raw?.trim();
		if (!number) {
			return;
		}
		// The same number is routinely stored twice in different shapes: the
		// `phones` array holds `+96181394966` while the legacy `phone` column
		// holds the bare national `81394966`. Treat one as a duplicate of the
		// other when the shorter is a suffix of the longer, so a card never
		// lists the same line twice.
		const digits = number.replace(/\D/g, "");
		if (!digits) {
			return;
		}
		const isDuplicate = seenDigits.some((seen) =>
			seen.length >= digits.length
				? seen.endsWith(digits)
				: digits.endsWith(seen),
		);
		if (isDuplicate) {
			return;
		}
		seenDigits.push(digits);
		ordered.push(number);
	};

	if (Array.isArray(customer.phones)) {
		const entries = customer.phones.filter(
			(p): p is { number: string; primary?: boolean } =>
				typeof p === "object" &&
				p !== null &&
				typeof (p as { number?: unknown }).number === "string",
		);
		for (const entry of [...entries].sort(
			(a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)),
		)) {
			push(entry.number);
		}
	}

	push(customer.mobile);
	push(customer.phone);

	return ordered;
}
