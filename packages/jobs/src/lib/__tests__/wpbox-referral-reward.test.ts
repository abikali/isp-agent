import { describe, expect, it } from "vitest";
import { arabicMonthLabel, sanitizeTemplateParam } from "../wpbox";

describe("arabicMonthLabel", () => {
	it("uses the Levantine month names", () => {
		expect(arabicMonthLabel(2026, 9)).toBe("أيلول 2026");
		expect(arabicMonthLabel(2026, 1)).toBe("كانون الثاني 2026");
		expect(arabicMonthLabel(2025, 12)).toBe("كانون الأول 2025");
	});

	it("falls back to digits for an out-of-range month", () => {
		expect(arabicMonthLabel(2026, 13)).toBe("13/2026");
	});
});

describe("sanitizeTemplateParam", () => {
	it("keeps a normal name", () => {
		expect(sanitizeTemplateParam("Mohamad Nouair", "x")).toBe(
			"Mohamad Nouair",
		);
	});

	it("flattens newlines, tabs and runs of spaces Meta rejects", () => {
		expect(sanitizeTemplateParam(" Jad\n\tAsmar      Jr ", "x")).toBe(
			"Jad Asmar Jr",
		);
	});

	it("falls back when the value is empty or blank", () => {
		expect(sanitizeTemplateParam(null, "صديقك")).toBe("صديقك");
		expect(sanitizeTemplateParam("   \n", "صديقك")).toBe("صديقك");
	});

	it("caps the length without leaving a trailing space", () => {
		expect(sanitizeTemplateParam("abcde fghij", "x", 6)).toBe("abcde");
	});
});
