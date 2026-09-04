import { describe, expect, it } from "vitest";
import { buildVerdict, progressNote } from "../lib/verdict";

const base = {
	periodLabel: "August 2026",
	isPartial: false,
	progress: 1,
	earned: 113602,
	spent: 91497,
	net: 22105,
	comparisonLabel: "July 2026",
	comparisonNet: 23925,
	comparisonEarned: 114431,
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

	it("withholds the pace comparison in the first days of a month", () => {
		// Day 2 of a month: $9k against a $59k August is not a $50k drop.
		const v = buildVerdict({
			...base,
			isPartial: true,
			progress: 0.04,
			net: 9005,
			comparisonNet: 59140,
		});
		expect(v.tone).toBe("steady");
		expect(v.detail).toContain("Too early to compare");
		expect(v.detail).not.toContain("less than");
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
		const v = buildVerdict({ ...base, net: -4000, spent: 117602 });
		expect(v.tone).toBe("bad");
		expect(v.headline).toBe(
			"In August 2026 you spent $4,000 more than you earned.",
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

	it("refuses to publish a verdict when a whole income stream is invisible", () => {
		// This is the exact failure the page replaced: wholesale income absent
		// while every cost of serving it was counted, producing a confident
		// monthly "loss" for a profitable business.
		const v = buildVerdict({
			...base,
			earned: 58189,
			net: -22236,
			incomeStreamMissing: true,
		});
		expect(v.tone).toBe("unknown");
		expect(v.headline).not.toMatch(/\$/);
		expect(v.detail).toContain("dealers");
		expect(v.caveat).toContain("iRadius");
	});

	it("admits when there is nothing to show", () => {
		const v = buildVerdict({ ...base, earned: 0, spent: 0, net: 0 });
		expect(v.tone).toBe("unknown");
		expect(v.headline).toContain("No money recorded");
	});

	it("never phrases the loss as taking in less, since earnings are the basis", () => {
		// Cash reaching the office is a transfer, not income. Saying "took in"
		// invited the old reading where a small handoff looked like a bad month.
		const v = buildVerdict({ ...base, net: -942 });
		expect(v.headline).toContain("more than you earned");
		expect(v.headline).not.toContain("took in");
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
