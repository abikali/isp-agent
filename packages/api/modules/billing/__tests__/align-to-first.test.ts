import { beirutEndOfDay } from "@repo/utils";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../customers/lib/iradius-disconnect", () => ({
	iradiusForceDisconnect: vi.fn(),
}));

import {
	calendarDays,
	dealerExtraTimeCharge,
	periodHoursFrom,
} from "../../customers/lib/iradius-extra-time";
import { alignTarget, nextYearMonth, prorate } from "../lib/align-to-first";

describe("alignTarget", () => {
	it("mid-month → the next 1st", () => {
		// 2026-09-21 12:06 Beirut
		expect(alignTarget(new Date("2026-09-21T09:06:00Z"))).toBe(
			"2026-10-01",
		);
	});

	it("exactly on a 1st before 23:59 → the same day (elsyaon)", () => {
		// 2026-10-01 12:06 Beirut
		expect(alignTarget(new Date("2026-10-01T09:06:00Z"))).toBe(
			"2026-10-01",
		);
	});

	it("rolls over the year", () => {
		expect(alignTarget(new Date("2026-12-15T10:00:00Z"))).toBe(
			"2027-01-01",
		);
	});

	it("uses the Beirut day, not UTC (Sep 30 22:30Z is already Oct 1 in Beirut)", () => {
		expect(alignTarget(new Date("2026-09-30T22:30:00Z"))).toBe(
			"2026-10-01",
		);
	});

	it("end of day across DST: Oct 1 → 20:59Z, Nov 1 → 21:59Z", () => {
		expect(beirutEndOfDay("2026-10-01").utc.toISOString()).toBe(
			"2026-10-01T20:59:00.000Z",
		);
		expect(beirutEndOfDay("2026-11-01").utc.toISOString()).toBe(
			"2026-11-01T21:59:00.000Z",
		);
		expect(beirutEndOfDay("2026-11-01").literal).toBe(
			"2026-11-01 23:59:00",
		);
	});
});

describe("calendarDays", () => {
	it("counts Beirut calendar days to the target", () => {
		expect(
			calendarDays(new Date("2026-09-21T09:06:00Z"), "2026-10-01"),
		).toBe(10);
		expect(
			calendarDays(new Date("2026-10-01T09:06:00Z"), "2026-10-01"),
		).toBe(0);
		expect(
			calendarDays(new Date("2026-10-05T09:06:00Z"), "2026-10-01"),
		).toBe(-4);
	});

	it("spans the DST change without losing a day", () => {
		expect(
			calendarDays(new Date("2026-10-20T09:00:00Z"), "2026-11-01"),
		).toBe(12);
	});
});

describe("periodHoursFrom", () => {
	it("a monthly plan starting Sep 21 is 720h", () => {
		expect(periodHoursFrom(new Date("2026-09-21T09:06:00Z"), 1, 1)).toBe(
			720,
		);
	});

	it("a month spanning the October DST change gains an hour", () => {
		expect(periodHoursFrom(new Date("2026-10-10T09:00:00Z"), 1, 1)).toBe(
			745,
		);
	});

	it("a 7-day plan is 168h", () => {
		expect(periodHoursFrom(new Date("2026-09-21T09:06:00Z"), 7, 2)).toBe(
			168,
		);
	});
});

describe("prorate", () => {
	it("elsyaon: 25 × 10 / 30 = 8.33 → $8", () => {
		expect(prorate(25, 10, 30)).toEqual({
			formulaAmount: 8.33,
			suggestedAmount: 8,
		});
	});

	it("suggests what was collected when it is within $1 of the formula", () => {
		expect(prorate(25, 11, 30, 9).suggestedAmount).toBe(9);
		expect(prorate(25, 10, 30, 12).suggestedAmount).toBe(8);
	});

	it("0 days costs nothing", () => {
		expect(prorate(25, 0, 30).suggestedAmount).toBe(0);
	});
});

describe("dealerExtraTimeCharge", () => {
	it("elsyaon: 10 days × 24 × $12 / 720h = $4.00 (DBL 448381)", () => {
		expect(dealerExtraTimeCharge(10, 12, 720)).toBe(4);
	});

	it("charlnassar: 34 days at Rate 12 over a 721h period = $13.58", () => {
		expect(dealerExtraTimeCharge(34, 12, 721)).toBe(13.58);
	});

	it("charges nothing for 0 days", () => {
		expect(dealerExtraTimeCharge(0, 12, 720)).toBe(0);
	});
});

describe("nextYearMonth", () => {
	it("rolls December into January", () => {
		expect(nextYearMonth(2026, 12)).toEqual({ year: 2027, month: 1 });
		expect(nextYearMonth(2026, 9)).toEqual({ year: 2026, month: 10 });
	});
});
