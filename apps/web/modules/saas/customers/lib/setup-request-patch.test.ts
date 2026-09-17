import { describe, expect, it } from "vitest";
import {
	buildSetupRequestPatch,
	firstMonthBill,
	parseMoneyInput,
} from "./setup-request-patch";

// 2026-10-14 20:55 Beirut (UTC+3) — a worker-created expiry with a real time.
const SAVED = {
	discount: 5,
	iptvPrice: 0,
	realIpPrice: 0,
	firstChargeAmount: 30,
	expiresAt: "2026-10-14T17:55:00.000Z",
};

const UNTOUCHED = {
	discount: "5",
	iptvPrice: "0",
	realIpPrice: "0",
	firstCharge: "30",
	expiresAt: "2026-10-14",
};

describe("parseMoneyInput", () => {
	it("treats empty as 0", () => {
		expect(parseMoneyInput("")).toBe(0);
		expect(parseMoneyInput("  ")).toBe(0);
	});

	it("rejects negative and non-numeric input", () => {
		expect(parseMoneyInput("-1")).toBeNull();
		expect(parseMoneyInput("abc")).toBeNull();
	});

	it("rounds to cents", () => {
		expect(parseMoneyInput("26.666")).toBe(26.67);
	});
});

describe("firstMonthBill", () => {
	it("nets the discount off the account price", () => {
		expect(firstMonthBill(30, 5)).toBe(25);
	});

	it("never goes below zero", () => {
		expect(firstMonthBill(30, 40)).toBe(0);
	});
});

describe("buildSetupRequestPatch", () => {
	it("sends nothing when the dialog is saved untouched", () => {
		expect(buildSetupRequestPatch(SAVED, UNTOUCHED)).toEqual({
			ok: true,
			patch: {},
		});
	});

	it("sends an explicit 0 when a saved discount is cleared", () => {
		expect(
			buildSetupRequestPatch(SAVED, { ...UNTOUCHED, discount: "" }),
		).toEqual({ ok: true, patch: { discount: 0 } });
	});

	it("sends only the fields that changed", () => {
		expect(
			buildSetupRequestPatch(SAVED, {
				...UNTOUCHED,
				iptvPrice: "10",
				firstCharge: "25",
			}),
		).toEqual({
			ok: true,
			patch: { iptvPrice: 10, firstChargeAmount: 25 },
		});
	});

	it("ignores float noise in the saved value", () => {
		expect(
			buildSetupRequestPatch(
				{ ...SAVED, firstChargeAmount: 26.666666666666668 },
				{ ...UNTOUCHED, firstCharge: "26.67" },
			),
		).toEqual({ ok: true, patch: {} });
	});

	it("rejects a negative price", () => {
		const result = buildSetupRequestPatch(SAVED, {
			...UNTOUCHED,
			realIpPrice: "-3",
		});
		expect(result.ok).toBe(false);
	});

	it("keeps the saved time of day when the expiry date changes", () => {
		const result = buildSetupRequestPatch(SAVED, {
			...UNTOUCHED,
			expiresAt: "2026-10-20",
		});
		expect(result.ok && result.patch.expiresAt?.toISOString()).toBe(
			"2026-10-20T17:55:00.000Z",
		);
	});

	it("does not send an empty expiry", () => {
		expect(
			buildSetupRequestPatch(SAVED, { ...UNTOUCHED, expiresAt: "" }),
		).toEqual({ ok: true, patch: {} });
	});
});
