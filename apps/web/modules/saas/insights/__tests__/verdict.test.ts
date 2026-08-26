import { describe, expect, it } from "vitest";
import { buildVerdict, progressNote } from "../lib/verdict";

const base = {
	periodLabel: "August 2026",
	isPartial: false,
	progress: 1,
	moneyIn: 113602,
	moneyOut: 91497,
	net: 22105,
	comparisonLabel: "July 2026",
	comparisonNet: 23925,
	comparisonMoneyIn: 114431,
	unclassifiedShare: 0,
};

describe("buildVerdict", () => {
	it("leads with what the owner kept, in his own words", () => {
		const v = buildVerdict(base);
		expect(v.headline).toBe("In August 2026 you kept $22,105.");
		expect(v.headline).not.toMatch(/net|margin|profit|handed off/i);
	});

	it("calls a near-flat month steady rather than manufacturing a trend", () => {
		const v = buildVerdict(base);
		expect(v.tone).toBe("steady");
		expect(v.detail).toBe("That's about the same as July 2026.");
	});

	it("says 'so far' and 'at this pace' for a part month", () => {
		const v = buildVerdict({
			...base,
			isPartial: true,
			progress: 0.5,
			net: 12000,
		});
		expect(v.headline).toContain("so far");
		expect(v.detail).toContain("At this pace");
	});

	it("does not read a half-finished month as a collapse", () => {
		// Half a month at the same run-rate must not report a 50% drop.
		const v = buildVerdict({
			...base,
			isPartial: true,
			progress: 0.5,
			net: 11962,
			comparisonNet: 23925,
		});
		expect(v.tone).not.toBe("bad");
		expect(v.detail).toContain("about the same");
	});

	it("states a real loss plainly", () => {
		const v = buildVerdict({ ...base, net: -4000, moneyOut: 117602 });
		expect(v.tone).toBe("bad");
		expect(v.headline).toBe(
			"In August 2026 you spent $4,000 more than you took in.",
		);
	});

	it("flags a meaningful drop as watch, not disaster", () => {
		const v = buildVerdict({ ...base, net: 15000 });
		expect(v.tone).toBe("watch");
		expect(v.detail).toContain("less than July 2026");
	});

	it("warns when too much spending is unsorted to trust the figure", () => {
		const v = buildVerdict({ ...base, unclassifiedShare: 0.31 });
		expect(v.caveat).toContain("31%");
	});

	it("stays quiet when classification is essentially complete", () => {
		expect(
			buildVerdict({ ...base, unclassifiedShare: 0.02 }).caveat,
		).toBeNull();
	});

	it("admits when there is nothing to show", () => {
		const v = buildVerdict({ ...base, moneyIn: 0, moneyOut: 0, net: 0 });
		expect(v.tone).toBe("unknown");
		expect(v.headline).toContain("No money recorded");
	});

	it("does not invent a comparison that does not exist", () => {
		const v = buildVerdict({ ...base, comparisonNet: 0 });
		expect(v.detail).toContain("nothing recorded for July 2026");
	});
});

describe("progressNote", () => {
	it("is silent for a complete period", () => {
		expect(progressNote(false, "2026-08-01T00:00:00Z")).toBeNull();
	});

	it("counts days into a partial period", () => {
		expect(
			progressNote(
				true,
				"2026-08-01T00:00:00Z",
				new Date("2026-08-27T00:00:00Z"),
			),
		).toBe("26 days in");
	});

	it("says 1 day, not 1 days", () => {
		expect(
			progressNote(
				true,
				"2026-08-01T00:00:00Z",
				new Date("2026-08-02T00:00:00Z"),
			),
		).toBe("1 day in");
	});
});
