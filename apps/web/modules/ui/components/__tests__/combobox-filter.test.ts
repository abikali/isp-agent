import { describe, expect, it } from "vitest";
import { labelSubstringFilter } from "../combobox";

function item(label: string) {
	return `${label}\0cm0abc123`;
}

describe("labelSubstringFilter", () => {
	it("matches a case-insensitive substring of the label", () => {
		expect(labelSubstringFilter(item("Cube Station"), "cube")).toBe(1);
		expect(labelSubstringFilter(item("Cube Station"), "  STATION ")).toBe(
			1,
		);
	});

	it("never matches against the appended option value", () => {
		expect(labelSubstringFilter(item("Cube Station"), "abc123")).toBe(0);
	});

	it("treats ta marbuta and ha as the same letter", () => {
		expect(labelSubstringFilter(item("كحاله الضيعة"), "كحالة")).toBe(1);
		expect(labelSubstringFilter(item("كحالة"), "كحاله")).toBe(1);
	});

	it("unifies alef forms and alef maqsura", () => {
		expect(labelSubstringFilter(item("أحمد"), "احمد")).toBe(1);
		expect(labelSubstringFilter(item("إبراهيم"), "ابراهيم")).toBe(1);
		expect(labelSubstringFilter(item("مصطفى"), "مصطفي")).toBe(1);
	});

	it("ignores tashkeel and tatweel", () => {
		expect(labelSubstringFilter(item("مُحَمَّد"), "محمد")).toBe(1);
		expect(labelSubstringFilter(item("محمد"), "مـحـمد")).toBe(1);
	});

	it("rejects labels that do not contain the search", () => {
		expect(labelSubstringFilter(item("عاليه"), "كحالة")).toBe(0);
	});
});
