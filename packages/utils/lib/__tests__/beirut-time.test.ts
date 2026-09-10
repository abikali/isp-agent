import { describe, expect, it } from "vitest";
import { beirutWallClockToUtc, beirutWeekday } from "../beirut-time";

describe("beirutWallClockToUtc", () => {
	it("interprets a summer wall-clock as UTC+3 (DST active)", () => {
		expect(beirutWallClockToUtc("2026-06-06T02:00").toISOString()).toBe(
			"2026-06-05T23:00:00.000Z",
		);
	});

	it("interprets a winter wall-clock as UTC+2 (standard time)", () => {
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

describe("beirutWeekday", () => {
	it("uses the Beirut calendar day, not UTC's", () => {
		// 22:30 UTC on Saturday 12 Sep 2026 is already Sunday 01:30 in Beirut.
		expect(beirutWeekday("2026-09-12T22:30:00.000Z")).toBe(0);
		expect(beirutWeekday("2026-09-12T12:00:00.000Z")).toBe(6);
	});
});
