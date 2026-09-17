import { describe, expect, it } from "vitest";
import { parseCoordinates } from "./chat-utils";

describe("parseCoordinates", () => {
	it("reads plain coordinates", () => {
		expect(parseCoordinates(" 33.8938, 35.5018 ")).toEqual({
			latitude: 33.8938,
			longitude: 35.5018,
		});
	});

	it("reads Google Maps links", () => {
		expect(
			parseCoordinates(
				"https://www.google.com/maps/place/Beirut/@33.8886,35.4955,14z",
			),
		).toEqual({ latitude: 33.8886, longitude: 35.4955 });
		expect(
			parseCoordinates("https://www.google.com/maps?q=34.4367,35.8497"),
		).toEqual({ latitude: 34.4367, longitude: 35.8497 });
	});

	it("rejects short links and out-of-range values", () => {
		expect(
			parseCoordinates("https://maps.app.goo.gl/abcDEF123"),
		).toBeNull();
		expect(parseCoordinates("95.1, 35.5")).toBeNull();
		expect(parseCoordinates("0, 0")).toBeNull();
	});
});
