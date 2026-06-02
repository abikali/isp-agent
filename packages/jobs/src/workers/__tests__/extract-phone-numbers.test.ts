// Import the pure helpers straight from source — the `@repo/database` index
// eagerly constructs the Prisma client (needs DATABASE_URL), which these pure
// functions don't.
import { describe, expect, it } from "vitest";
import {
	buildPhonesFromSync,
	extractPhoneNumbers,
} from "../../../../database/lib/phones";

/**
 * `extractPhoneNumbers` is the guard that keeps non-numbers out of
 * `Customer.phones`. Legacy iRadius rows (esp. dealer "RodNet") stuffed
 * distribution-box / contact names into the `Phone` (and sometimes `Mobile`)
 * column; without this the names ended up stored as phone numbers.
 */
describe("extractPhoneNumbers", () => {
	it("drops pure names / labels", () => {
		for (const junk of [
			"yordi",
			"sara tanous",
			"Boite Pharmacie",
			"Akram khoury 2",
			"daraj hadid",
			"Malab",
			"undefined",
			"",
			"2",
		]) {
			expect(extractPhoneNumbers(junk)).toEqual([]);
		}
	});

	it("normalizes valid Lebanese numbers to E.164", () => {
		expect(extractPhoneNumbers("+96176187682")).toEqual(["+96176187682"]);
		expect(extractPhoneNumbers("81050911")).toEqual(["+96181050911"]);
		expect(extractPhoneNumbers("03609784")).toEqual(["+9613609784"]);
		expect(extractPhoneNumbers("03 904 999")).toEqual(["+9613904999"]);
	});

	it("extracts the number out of a 'number + label' value", () => {
		expect(extractPhoneNumbers("81261820-akram khoury 2")).toEqual([
			"+96181261820",
		]);
		expect(extractPhoneNumbers("79158330-Teddy khoury f5 }1")).toEqual([
			"+96179158330",
		]);
	});

	it("splits two numbers separated by a double space", () => {
		expect(extractPhoneNumbers("71112011  76111211")).toEqual([
			"+96171112011",
			"+96176111211",
		]);
	});

	it("keeps an unusual-but-real number that fails Lebanese validation", () => {
		// Syrian mobile (09… prefix) — preserve digits rather than delete it.
		expect(extractPhoneNumbers("0938556734")).toEqual(["0938556734"]);
	});

	it("drops an implausibly long blob instead of truncating it", () => {
		// Two numbers concatenated with no separator → ambiguous → dropped.
		expect(extractPhoneNumbers("+96178815960813483")).toEqual([]);
		expect(extractPhoneNumbers("7611090470163577")).toEqual([]);
	});

	it("handles null / undefined input", () => {
		expect(extractPhoneNumbers(null)).toEqual([]);
		expect(extractPhoneNumbers(undefined)).toEqual([]);
	});
});

describe("buildPhonesFromSync", () => {
	it("keeps the real mobile and drops the name in the Phone column", () => {
		expect(buildPhonesFromSync("+96176187682", "yordi")).toEqual([
			{ number: "+96176187682", primary: true },
		]);
	});

	it("dedupes a number that appears in both columns", () => {
		expect(buildPhonesFromSync("81050911", "81050911")).toEqual([
			{ number: "+96181050911", primary: true },
		]);
	});

	it("returns nothing when both columns are names", () => {
		expect(buildPhonesFromSync("Malab", "Boite Pharmacie")).toEqual([]);
	});
});
