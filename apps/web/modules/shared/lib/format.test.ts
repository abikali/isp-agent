import { describe, expect, it } from "vitest";
import { beirutWallClockToUtc, formatDateTimeLocalInput } from "./format";

describe("beirutWallClockToUtc", () => {
	it("interprets a summer wall-clock as UTC+3 (DST active)", () => {
		// Beirut observes DST in June → UTC+3. 02:00 Beirut = 23:00 UTC prev day.
		expect(beirutWallClockToUtc("2026-06-06T02:00").toISOString()).toBe(
			"2026-06-05T23:00:00.000Z",
		);
	});

	it("interprets a winter wall-clock as UTC+2 (standard time)", () => {
		// January → UTC+2. 02:00 Beirut = 00:00 UTC same day.
		expect(beirutWallClockToUtc("2026-01-15T02:00").toISOString()).toBe(
			"2026-01-15T00:00:00.000Z",
		);
	});

	it("returns an invalid date for unparseable input", () => {
		expect(Number.isNaN(beirutWallClockToUtc("not-a-date").getTime())).toBe(
			true,
		);
	});
});

describe("formatDateTimeLocalInput", () => {
	it("renders a UTC instant as Beirut wall-clock (summer)", () => {
		// 23:00 UTC in summer → 02:00 next day Beirut (UTC+3).
		expect(formatDateTimeLocalInput("2026-06-05T23:00:00.000Z")).toBe(
			"2026-06-06T02:00",
		);
	});

	it("renders a UTC instant as Beirut wall-clock (winter)", () => {
		// 00:00 UTC in winter → 02:00 Beirut (UTC+2).
		expect(formatDateTimeLocalInput("2026-01-15T00:00:00.000Z")).toBe(
			"2026-01-15T02:00",
		);
	});

	it("round-trips wall-clock → UTC → wall-clock", () => {
		const local = "2026-09-20T14:30";
		expect(formatDateTimeLocalInput(beirutWallClockToUtc(local))).toBe(
			local,
		);
	});
});
