import {
	type CountryCode,
	parsePhoneNumberFromString,
} from "libphonenumber-js";

/**
 * Default country for unqualified inputs. The ISP operates in Lebanon, so a
 * bare-national string like "71234567" is interpreted as `+961-71234567`.
 * Anything with a real `+CC` prefix in the input is honoured as-is —
 * libphonenumber-js ignores `defaultCountry` once it finds an explicit one.
 */
const DEFAULT_COUNTRY: CountryCode = "LB";

export interface ParsedPhone {
	/** E.164 international form, e.g. `+96171234567`. Use for DB storage. */
	e164: string;
	/** Digits-only with country code, e.g. `96171234567`. WhatsApp send target. */
	digits: string;
	/** Bare national subscriber number — no CC, no leading 0. `71234567`. */
	national: string;
	/** Domestic format with leading 0, e.g. `071234567`. */
	domestic: string;
	/** ISO country code, e.g. `LB`, `SY`. */
	country: CountryCode;
}

/**
 * Parse any phone input into structured components.
 *
 * Returns `null` for inputs that aren't valid phone numbers (e.g. a username,
 * Arabic text, garbage). The caller is responsible for fallback behaviour.
 *
 * Use this instead of hand-rolling `+961` / `00961` / `961` branching — every
 * country code is handled uniformly and the rules stay in sync with global
 * numbering plan changes via the libphonenumber-js library upgrades.
 */
export function parsePhone(
	raw: string | null | undefined,
	defaultCountry: CountryCode = DEFAULT_COUNTRY,
): ParsedPhone | null {
	if (!raw) {
		return null;
	}
	const parsed = parsePhoneNumberFromString(raw, defaultCountry);
	if (!parsed?.isValid()) {
		return null;
	}
	const national = parsed.nationalNumber.toString();
	return {
		e164: parsed.number,
		digits: parsed.number.replace(/^\+/, ""),
		national,
		domestic: `0${national}`,
		country: parsed.country ?? defaultCountry,
	};
}

/**
 * Convert any phone to E.164 (`+96171234567`). Used for DB storage and
 * display so all numbers share one canonical shape regardless of input.
 *
 * Returns the raw input unchanged when libphonenumber can't validate it —
 * we'd rather pass legacy / dirty data through verbatim than fabricate a
 * `+digits` value that happens to look like a real number.
 */
export function toE164(raw: string): string {
	const parsed = parsePhone(raw);
	if (parsed) {
		return parsed.e164;
	}
	return raw;
}

/**
 * Digit-only form for WhatsApp / WaSender (no leading `+`).
 * Falls back to digit-stripped input when parsing fails.
 */
export function toDigits(raw: string): string {
	const parsed = parsePhone(raw);
	if (parsed) {
		return parsed.digits;
	}
	const digits = raw.replace(/\D/g, "");
	// Legacy: short Lebanese-only inputs without CC get the 961 prefix added
	// so WaSender accepts them. Anything ≥10 digits is assumed CC-qualified.
	if (digits.length < 10 && digits.length > 0) {
		if (digits.startsWith("0")) {
			return `961${digits.slice(1)}`;
		}
		return `961${digits}`;
	}
	return digits;
}

/**
 * Bare national subscriber number with no country code and no leading 0.
 *
 * This is what we feed to iRadius `/user-info?mobile=X`, which does a
 * substring LIKE match against `User.Mobile`. The bare-national form
 * substring-matches all three historical storage shapes (`+961XXXX`,
 * `0XXXX`, `XXXX`) without needing to know which shape any given row uses.
 *
 * For non-Lebanese numbers (Syrian, Iraqi, etc.) the bare-national form is
 * usually still the most matching-friendly variant — Syrian `+963998184707`
 * stored anywhere will still substring-contain `998184707`.
 *
 * Falls back to digit-stripped input when parsing fails so partial / typo'd
 * phones the customer types in chat still produce a search term.
 */
export function toNationalDigits(raw: string): string {
	const parsed = parsePhone(raw);
	if (parsed) {
		return parsed.national;
	}
	const digits = raw.replace(/\D/g, "");
	// Legacy Lebanese domestic shortcut: `03123456` → `3123456`. We only do
	// this for the unparseable fallback; parsePhone handles it cleanly when
	// the input is a real Lebanese number.
	if (/^0\d{6,7}$/.test(digits)) {
		return digits.slice(1);
	}
	return digits;
}

/**
 * Storage-format variants of a phone, for OR-queries against fields that
 * may have been stored in any of the historical shapes.
 *
 * For a parseable input we return `[e164, digits, national, domestic]`.
 * For unparseable input we return `[digits, +digits]` if any digits exist,
 * else `[]`.
 *
 * Caller should combine these with `findMany({ OR: [{ mobile: { in: variants } }, ...] })`
 * and apply their own multi-match policy (we usually treat 2+ matches as
 * ambiguous and bail out instead of picking one).
 */
export function phoneSearchVariants(raw: string): string[] {
	const parsed = parsePhone(raw);
	const set = new Set<string>();
	if (parsed) {
		set.add(parsed.e164);
		set.add(parsed.digits);
		set.add(parsed.national);
		set.add(parsed.domestic);
	} else {
		const digits = raw.replace(/\D/g, "");
		if (digits) {
			set.add(digits);
			set.add(`+${digits}`);
		}
	}
	return Array.from(set);
}

/**
 * Legacy alias — prefer {@link toDigits}.
 * Kept for back-compat with callers that haven't been migrated yet.
 */
export function normalizePhone(phone: string): string {
	return toDigits(phone);
}
