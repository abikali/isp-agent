import { describe, expect, it } from "vitest";
import { formatWhatsAppLink } from "./whatsapp";

describe("formatWhatsAppLink", () => {
	it("prefixes bare Lebanese numbers with 961", () => {
		expect(formatWhatsAppLink("76547175")).toBe(
			"https://wa.me/96176547175",
		);
		expect(formatWhatsAppLink("03 987 654")).toBe(
			"https://wa.me/9613987654",
		);
	});

	it("leaves numbers that already carry a country code alone", () => {
		expect(formatWhatsAppLink("+96176547175")).toBe(
			"https://wa.me/96176547175",
		);
		expect(formatWhatsAppLink("+963 944 123 456")).toBe(
			"https://wa.me/963944123456",
		);
	});

	it("returns null for empty input", () => {
		expect(formatWhatsAppLink("")).toBeNull();
		expect(formatWhatsAppLink(null)).toBeNull();
	});
});
