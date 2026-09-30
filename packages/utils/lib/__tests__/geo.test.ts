import { describe, expect, it } from "vitest";
import { directionsUrl, distanceMeters, isUsablePin, mapViewUrl } from "../geo";

describe("isUsablePin", () => {
	it("accepts a real Lebanese pin", () => {
		expect(isUsablePin(33.8938, 35.5018)).toBe(true);
	});

	it("rejects missing coordinates", () => {
		expect(isUsablePin(null, 35.5)).toBe(false);
		expect(isUsablePin(33.9, undefined)).toBe(false);
		expect(isUsablePin(null, null)).toBe(false);
	});

	it("rejects iRadius zero and near-zero noise pins", () => {
		expect(isUsablePin(0, 0)).toBe(false);
		expect(isUsablePin(42.885994, 0.000008)).toBe(false);
		expect(isUsablePin(20.778942, 0.000005)).toBe(false);
		expect(isUsablePin(0.0005, 35.5)).toBe(false);
	});

	it("rejects out-of-range and non-finite values", () => {
		expect(isUsablePin(91, 35.5)).toBe(false);
		expect(isUsablePin(33.9, 181)).toBe(false);
		expect(isUsablePin(Number.NaN, 35.5)).toBe(false);
		expect(isUsablePin(33.9, Number.POSITIVE_INFINITY)).toBe(false);
	});
});

describe("directionsUrl", () => {
	it("builds a Google Maps directions link for coordinates", () => {
		expect(directionsUrl("33.8938,35.5018")).toBe(
			"https://www.google.com/maps/dir/?api=1&destination=33.8938%2C35.5018",
		);
	});

	it("encodes free-text addresses", () => {
		expect(directionsUrl("Jbeil, main road")).toBe(
			"https://www.google.com/maps/dir/?api=1&destination=Jbeil%2C%20main%20road",
		);
	});
});

describe("mapViewUrl", () => {
	it("builds a plain pin link", () => {
		expect(mapViewUrl(33.878, 35.5649)).toBe(
			"https://www.google.com/maps?q=33.878,35.5649",
		);
	});
});

describe("distanceMeters", () => {
	it("is zero for the same pin", () => {
		const pin = { latitude: 33.878, longitude: 35.5649 };
		expect(distanceMeters(pin, pin)).toBe(0);
	});

	it("measures ~28 m between two neighbours on one box", () => {
		const d = distanceMeters(
			{ latitude: 33.878, longitude: 35.5649 },
			{ latitude: 33.878, longitude: 35.5652 },
		);
		expect(d).toBeGreaterThan(25);
		expect(d).toBeLessThan(32);
	});

	it("measures ~111 km per degree of latitude", () => {
		const d = distanceMeters(
			{ latitude: 33, longitude: 35.5 },
			{ latitude: 34, longitude: 35.5 },
		);
		expect(Math.round(d / 1000)).toBe(111);
	});
});
