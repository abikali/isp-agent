import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({ db: {} }));

import {
	countsAsCollected,
	resolveCountPolicy,
} from "../lib/collector-count-policy";

const org = { collectorCountsFree: true, collectorCountsStop: false };

const row = (over: Partial<Parameters<typeof countsAsCollected>[0]>) => ({
	activeCashSettled: false,
	activeFree: false,
	activeStopped: false,
	...over,
});

describe("resolveCountPolicy", () => {
	it("inherits the org default when the collector has no override", () => {
		expect(resolveCountPolicy(org, null)).toEqual({
			free: true,
			stop: false,
		});
		expect(
			resolveCountPolicy(org, {
				countsFreeOverride: null,
				countsStopOverride: null,
			}),
		).toEqual({ free: true, stop: false });
	});

	it("a collector override wins over the org default", () => {
		expect(
			resolveCountPolicy(org, {
				countsFreeOverride: false,
				countsStopOverride: true,
			}),
		).toEqual({ free: false, stop: true });
	});
});

describe("countsAsCollected", () => {
	it("cash-covered months always count", () => {
		expect(
			countsAsCollected(row({ activeCashSettled: true }), {
				free: false,
				stop: false,
			}),
		).toBe(true);
	});

	it("free counts only when the policy says so", () => {
		expect(
			countsAsCollected(row({ activeFree: true }), {
				free: true,
				stop: false,
			}),
		).toBe(true);
		expect(
			countsAsCollected(row({ activeFree: true }), {
				free: false,
				stop: false,
			}),
		).toBe(false);
	});

	it("a stop counts when the policy counts stops", () => {
		expect(
			countsAsCollected(row({ activeStopped: true }), {
				free: false,
				stop: true,
			}),
		).toBe(true);
		expect(
			countsAsCollected(row({ activeStopped: true }), {
				free: true,
				stop: false,
			}),
		).toBe(false);
	});

	it("a partial month never counts, whatever the policy", () => {
		// activeCashSettled is false for $10 of $50 (amount-aware settlement).
		expect(countsAsCollected(row({}), { free: true, stop: true })).toBe(
			false,
		);
	});
});
