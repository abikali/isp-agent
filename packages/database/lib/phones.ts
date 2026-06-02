import { parsePhone, toE164 } from "@repo/utils";

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
 * Normalize any phone number to E.164 format (`+96171234567`).
 *
 * Delegates to libphonenumber-js so country handling stays uniform — Syrian,
 * Iraqi, Saudi etc. numbers parse correctly without per-country branching.
 * Bare-national inputs without an explicit country code (e.g. `71234567` or
 * `03609014`) are interpreted as Lebanese, matching the historical behaviour.
 *
 * Name kept as `normalizeLebanesePhone` for back-compat; the implementation
 * is now country-agnostic.
 */
export function normalizeLebanesePhone(raw: string): string {
	return toE164(raw);
}

/**
 * Split a raw phone string into individual numbers.
 * Handles comma-separated values and dash-separated values.
 * Dashes are only treated as separators when they sit between two
 * digit groups that are each long enough to be a phone number (≥ 7 digits).
 */
export function splitPhoneString(raw: string): string[] {
	return raw
		.split(",")
		.flatMap((part) => {
			const trimmed = part.trim();
			const dashParts = trimmed.split("-").map((s) => s.trim());
			if (
				dashParts.length === 2 &&
				(dashParts[0]?.replace(/\D/g, "").length ?? 0) >= 7 &&
				(dashParts[1]?.replace(/\D/g, "").length ?? 0) >= 7
			) {
				return dashParts;
			}
			return [trimmed];
		})
		.filter(Boolean);
}

/**
 * Matches a phone-like run of 7–15 digits (optionally `+`-prefixed), allowing
 * single space/dash/dot/slash separators between digits. Used to pull real
 * numbers out of dirty strings that also contain labels, e.g.
 * `"81261820-akram khoury 2"` or `"71112011  76111211"` (a double space ends
 * the run, so two numbers split apart instead of merging into one).
 *
 * The digit lookarounds (`(?<!\d)` / `(?!\d)`) anchor to a whole run: a blob
 * longer than 15 digits (e.g. two numbers concatenated with no separator) is
 * left unmatched and dropped rather than silently truncated into a fake one.
 */
const PHONE_TOKEN_RE = /(?<!\d)\+?\d(?:[\s\-./]?\d){6,14}(?!\d)/g;

/**
 * Extract phone numbers from a raw, possibly-dirty string, dropping anything
 * that isn't a number. Legacy iRadius rows routinely stuff contact/landmark
 * names into the `Phone` (and sometimes `Mobile`) column — e.g.
 * `"Boite Pharmacie"`, `"sara tanous"`, or `"81261820-akram khoury 2"`. Those
 * names must never reach `Customer.phones`.
 *
 * A "number" is any run of 7–15 digits (a real phone can't be shorter), so a
 * name with no such run yields nothing. Each extracted run is normalized to
 * E.164 when `parsePhone` recognises it; otherwise its `+`/digits are kept
 * verbatim — we'd rather preserve an unusual-but-real number (e.g. a Syrian
 * `09…` mobile that doesn't validate under the Lebanese default) than delete
 * it. A `"num  num"` value (double space) yields both numbers.
 */
export function extractPhoneNumbers(raw: string | null | undefined): string[] {
	if (!raw) {
		return [];
	}
	const result: string[] = [];
	const seen = new Set<string>();
	for (const token of raw.match(PHONE_TOKEN_RE) ?? []) {
		const parsed = parsePhone(token);
		const cleaned = parsed
			? parsed.e164
			: (token.trimStart().startsWith("+") ? "+" : "") +
				token.replace(/\D/g, "");
		if (cleaned && !seen.has(cleaned)) {
			seen.add(cleaned);
			result.push(cleaned);
		}
	}
	return result;
}

/**
 * Build the dash-joined string written back to iRadius `User.Mobile`.
 * Primary first, rest follow input order, dedup by exact number match.
 * Returns null when no phones — caller clears the column.
 */
export function buildIRadiusMobile(phones: unknown): string | null {
	const parsed = parsePhones(phones);
	const ordered = [...parsed].sort(
		(a, b) => Number(b.primary) - Number(a.primary),
	);
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const p of ordered) {
		const trimmed = p.number.trim();
		if (trimmed && !seen.has(trimmed)) {
			seen.add(trimmed);
			unique.push(trimmed);
		}
	}
	return unique.length > 0 ? unique.join("-") : null;
}

/**
 * Build a phones array from raw mobile/phone strings (for iRadius sync).
 * Handles comma-separated and dash-separated phone values and normalizes to +961 format.
 */
export function buildPhonesFromSync(
	mobile: string | null,
	phone: string | null,
): CustomerPhone[] {
	const phones: CustomerPhone[] = [];
	const seen = new Set<string>();

	// Mobile first (it holds the primary), then Phone. `extractPhoneNumbers`
	// drops anything that isn't a real number, so labels stuffed into the
	// legacy `Phone` column never reach `Customer.phones`.
	for (const raw of [mobile, phone]) {
		for (const number of extractPhoneNumbers(raw)) {
			if (!seen.has(number)) {
				phones.push({ number, primary: phones.length === 0 });
				seen.add(number);
			}
		}
	}

	return phones.slice(0, MAX_PHONES);
}
