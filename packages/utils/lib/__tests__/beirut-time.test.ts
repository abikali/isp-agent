import { describe, expect, it } from "vitest";
import {
	beirutDayEndUtc,
	beirutDayStartUtc,
	beirutWallClockToUtc,
	beirutWeekday,
	dueDeadline,
	formatBeirutDue,
} from "../beirut-time";

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

describe("beirutDayStartUtc / beirutDayEndUtc", () => {
	it("brackets a summer Beirut day (UTC+3)", () => {
		expect(beirutDayStartUtc("2026-09-30T12:00:00Z").toISOString()).toBe(
			"2026-09-29T21:00:00.000Z",
		);
		expect(beirutDayEndUtc("2026-09-30T12:00:00Z").toISOString()).toBe(
			"2026-09-30T20:59:59.999Z",
		);
	});

	it("brackets a winter Beirut day (UTC+2)", () => {
		expect(beirutDayEndUtc("2026-01-15T12:00:00Z").toISOString()).toBe(
			"2026-01-15T21:59:59.999Z",
		);
	});

	it("uses the Beirut day for a legacy UTC-midnight value", () => {
		// 00:00 UTC is 03:00 Beirut on the same calendar day.
		expect(beirutDayEndUtc("2026-09-30T00:00:00Z").toISOString()).toBe(
			"2026-09-30T20:59:59.999Z",
		);
	});

	it("ends the spring-forward day at UTC+3 (last Sunday of March)", () => {
		expect(beirutDayEndUtc("2026-03-29T12:00:00Z").toISOString()).toBe(
			"2026-03-29T20:59:59.999Z",
		);
	});

	it("ends the fall-back day at UTC+2 (last Sunday of October)", () => {
		expect(beirutDayEndUtc("2026-10-25T12:00:00Z").toISOString()).toBe(
			"2026-10-25T21:59:59.999Z",
		);
	});
});

describe("formatBeirutDue", () => {
	it("prints a date-only value as its Beirut day", () => {
		expect(formatBeirutDue("2026-09-30T09:00:00Z", false)).toBe(
			"30/09/2026",
		);
	});

	it("prints the Beirut wall-clock time on both sides of DST", () => {
		expect(formatBeirutDue("2026-09-30T11:30:00Z", true)).toBe(
			"30/09/2026 14:30",
		);
		expect(formatBeirutDue("2026-10-26T12:30:00Z", true)).toBe(
			"26/10/2026 14:30",
		);
		expect(formatBeirutDue("2026-03-30T11:30:00Z", true)).toBe(
			"30/03/2026 14:30",
		);
	});

	it("rolls a late-UTC instant onto the next Beirut day", () => {
		expect(formatBeirutDue("2026-09-30T22:15:00Z", true)).toBe(
			"01/10/2026 01:15",
		);
	});
});

describe("dueDeadline", () => {
	it("is the instant itself when a time is set", () => {
		expect(dueDeadline("2026-09-30T11:30:00Z", true).toISOString()).toBe(
			"2026-09-30T11:30:00.000Z",
		);
	});

	it("is the Beirut end of day for a date-only value", () => {
		expect(dueDeadline("2026-09-30T09:00:00Z", false).toISOString()).toBe(
			"2026-09-30T20:59:59.999Z",
		);
	});
});
