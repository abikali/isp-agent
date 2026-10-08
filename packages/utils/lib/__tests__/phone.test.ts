import { describe, expect, it } from "vitest";
import {
	firstMobileCandidate,
	parsePhone,
	phoneSearchVariants,
	toDigits,
	toE164,
	toLebaneseLandline,
	toNationalDigits,
} from "../phone";

describe("parsePhone", () => {
	it("parses an international Lebanese number", () => {
		const p = parsePhone("+96171234567");
		expect(p?.e164).toBe("+96171234567");
		expect(p?.national).toBe("71234567");
		expect(p?.domestic).toBe("071234567");
		expect(p?.digits).toBe("96171234567");
		expect(p?.country).toBe("LB");
	});

	it("parses a bare national Lebanese number using the default country", () => {
		const p = parsePhone("71234567");
		expect(p?.e164).toBe("+96171234567");
		expect(p?.national).toBe("71234567");
	});

	it("parses a domestic Lebanese number with leading 0", () => {
		const p = parsePhone("03123456");
		expect(p?.e164).toBe("+9613123456");
		expect(p?.national).toBe("3123456");
	});

	it("parses a Syrian number", () => {
		const p = parsePhone("+963998184707");
		expect(p?.e164).toBe("+963998184707");
		expect(p?.national).toBe("998184707");
		expect(p?.country).toBe("SY");
	});

	it("returns null for non-phone input (usernames, Arabic text)", () => {
		expect(parsePhone("rolab")).toBeNull();
		expect(parsePhone("أحمد رفيق")).toBeNull();
	});

	it("returns null for null/undefined/empty input", () => {
		expect(parsePhone(null)).toBeNull();
		expect(parsePhone(undefined)).toBeNull();
		expect(parsePhone("")).toBeNull();
	});
});

describe("toE164", () => {
	it("normalizes a domestic Lebanese number to E.164", () => {
		expect(toE164("03123456")).toBe("+9613123456");
	});

	it("returns input unchanged when parsing fails (legacy fallback)", () => {
		expect(toE164("rolab")).toBe("rolab");
	});
});

describe("toDigits", () => {
	it("returns digits-only with country code for WhatsApp send", () => {
		expect(toDigits("+96171234567")).toBe("96171234567");
		expect(toDigits("03123456")).toBe("9613123456");
		expect(toDigits("71234567")).toBe("96171234567");
	});
});

describe("toNationalDigits", () => {
	it("returns bare national digits for iRadius substring matching", () => {
		expect(toNationalDigits("+96171234567")).toBe("71234567");
		expect(toNationalDigits("+9613123456")).toBe("3123456");
		expect(toNationalDigits("03 123 456")).toBe("3123456");
		expect(toNationalDigits("71234567")).toBe("71234567");
	});

	it("works for non-Lebanese country codes", () => {
		expect(toNationalDigits("+963998184707")).toBe("998184707");
	});

	it("falls back to digit-stripped input for unparseable text", () => {
		// Username — no digits left
		expect(toNationalDigits("josephuser")).toBe("");
	});
});

describe("phoneSearchVariants", () => {
	it("generates all four storage formats for a Lebanese mobile", () => {
		const v = phoneSearchVariants("+96171234567");
		expect(v).toContain("+96171234567");
		expect(v).toContain("96171234567");
		expect(v).toContain("71234567");
		expect(v).toContain("071234567");
	});

	it("generates the same variants regardless of input format", () => {
		const fromIntl = new Set(phoneSearchVariants("+96171234567"));
		const fromBare = new Set(phoneSearchVariants("71234567"));
		const fromDomestic = new Set(phoneSearchVariants("071234567"));
		expect(fromIntl).toEqual(fromBare);
		expect(fromIntl).toEqual(fromDomestic);
	});

	it("generates variants for a Syrian number — country handling is uniform", () => {
		const v = phoneSearchVariants("+963998184707");
		expect(v).toContain("+963998184707");
		expect(v).toContain("963998184707");
		expect(v).toContain("998184707");
		expect(v).toContain("0998184707");
	});

	it("returns digit-only fallbacks when input is unparseable", () => {
		const v = phoneSearchVariants("abc 123 def");
		expect(v).toContain("123");
		expect(v).toContain("+123");
	});

	it("returns empty array when input has no digits", () => {
		expect(phoneSearchVariants("rolab")).toEqual([]);
	});
});

describe("toLebaneseLandline", () => {
	it("accepts every domestic shape of a landline", () => {
		expect(toLebaneseLandline("04 123456")).toBe("+9614123456");
		expect(toLebaneseLandline("4123456")).toBe("+9614123456");
		expect(toLebaneseLandline("+961 1 680979")).toBe("+9611680979");
		expect(toLebaneseLandline("00961 7 916626")).toBe("+9617916626");
		expect(toLebaneseLandline("09-234567")).toBe("+9619234567");
	});

	it("rejects mobiles, foreign numbers and junk", () => {
		expect(toLebaneseLandline("03 123456")).toBeNull();
		expect(toLebaneseLandline("71 123456")).toBeNull();
		expect(toLebaneseLandline("+96176321501")).toBeNull();
		expect(toLebaneseLandline("+963998184707")).toBeNull();
		expect(toLebaneseLandline("0412345")).toBeNull();
		expect(toLebaneseLandline("")).toBeNull();
		expect(toLebaneseLandline(null)).toBeNull();
	});
});

describe("firstMobileCandidate", () => {
	it("skips empties and landlines", () => {
		expect(firstMobileCandidate([null, "", "04 123456", "71 123456"])).toBe(
			"71 123456",
		);
		expect(firstMobileCandidate(["+9611680979"])).toBeNull();
	});
});
