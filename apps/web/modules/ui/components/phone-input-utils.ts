import { isValidPhoneNumber } from "libphonenumber-js/max";

export const COUNTRY_CODES = [
	{
		code: "LB",
		dialCode: "+961",
		flag: "\u{1F1F1}\u{1F1E7}",
		name: "Lebanon",
	},
	{ code: "SY", dialCode: "+963", flag: "\u{1F1F8}\u{1F1FE}", name: "Syria" },
	{ code: "IQ", dialCode: "+964", flag: "\u{1F1EE}\u{1F1F6}", name: "Iraq" },
	{
		code: "JO",
		dialCode: "+962",
		flag: "\u{1F1EF}\u{1F1F4}",
		name: "Jordan",
	},
	{
		code: "BD",
		dialCode: "+880",
		flag: "\u{1F1E7}\u{1F1E9}",
		name: "Bangladesh",
	},
	{
		code: "SA",
		dialCode: "+966",
		flag: "\u{1F1F8}\u{1F1E6}",
		name: "Saudi Arabia",
	},
	{ code: "AE", dialCode: "+971", flag: "\u{1F1E6}\u{1F1EA}", name: "UAE" },
	{ code: "US", dialCode: "+1", flag: "\u{1F1FA}\u{1F1F8}", name: "US" },
] as const;

/** Sorted dial codes longest-first for greedy prefix matching */
const DIAL_CODES_DESC = COUNTRY_CODES.map((c) => c.dialCode).sort(
	(a, b) => b.length - a.length,
);

/**
 * Parse a full phone string into { dialCode, localNumber }.
 * Tries to match a known dial code prefix; defaults to +961.
 */
export function parsePhone(value: string): {
	dialCode: string;
	localNumber: string;
} {
	const digits = value.replace(/[\s\-()]/g, "");

	if (digits.startsWith("+")) {
		for (const dc of DIAL_CODES_DESC) {
			if (digits.startsWith(dc)) {
				return { dialCode: dc, localNumber: digits.slice(dc.length) };
			}
		}
		// Unknown prefix — keep as-is with default code
		return { dialCode: "+961", localNumber: digits.replace(/^\+/, "") };
	}

	// No + prefix — assume Lebanon, strip trunk prefix
	const raw = digits.replace(/^0/, "");
	return { dialCode: "+961", localNumber: raw };
}

/**
 * Convert a phone value to proper international format.
 * Strips trunk prefix (leading 0) from the local number.
 * "+96103123456" → "+9613123456", "03123456" → "+9613123456"
 */
export function toInternationalPhone(phone: string): string {
	const { dialCode, localNumber } = parsePhone(phone);
	const stripped = localNumber.replace(/^0/, "");
	return `${dialCode}${stripped}`;
}

/**
 * Strip formatting and normalize to international format for storage/API use.
 * "+961 03 123 456" → "+9613123456"
 */
export function stripPhone(phone: string): string {
	return toInternationalPhone(phone);
}

/** Validate a phone number for the detected country using libphonenumber-js */
export function isValidPhone(phone: string): boolean {
	const international = toInternationalPhone(phone);
	if (international.replace(/\D/g, "").length <= 3) {
		return false;
	}
	const { dialCode } = parsePhone(phone);
	const country = COUNTRY_CODES.find((c) => c.dialCode === dialCode);
	return isValidPhoneNumber(
		international,
		country?.code as Parameters<typeof isValidPhoneNumber>[1],
	);
}
