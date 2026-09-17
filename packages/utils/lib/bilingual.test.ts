import { describe, expect, it } from "vitest";
import { bilingual } from "./bilingual";

describe("bilingual", () => {
	it("joins English and an isolated Arabic half", () => {
		expect(bilingual("Quantity", "الكمية")).toBe("Quantity · ⁨الكمية⁩");
	});
});
