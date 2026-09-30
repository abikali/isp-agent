import { describe, expect, it, vi } from "vitest";

vi.mock("@repo/database", () => ({ db: {} }));

import { frozenInvoiceExpiry } from "../lib/resolve-month";

const range = {
	gte: new Date("2026-09-01T00:00:00Z"),
	lte: new Date("2026-09-30T23:59:59Z"),
};

describe("frozenInvoiceExpiry", () => {
	it("falls back to the end of the month when the customer has no expiry", () => {
		expect(frozenInvoiceExpiry(null, range)).toEqual(range.lte);
	});

	it("lifts a stale expiry (ginaantipas, 2025-11-11) to the month start", () => {
		expect(
			frozenInvoiceExpiry(new Date("2025-11-11T20:59:00Z"), range),
		).toEqual(range.gte);
	});

	it("keeps a future expiry", () => {
		const future = new Date("2026-10-24T20:59:00Z");
		expect(frozenInvoiceExpiry(future, range)).toEqual(future);
	});

	it("keeps a mid-month expiry", () => {
		const mid = new Date("2026-09-15T20:59:00Z");
		expect(frozenInvoiceExpiry(mid, range)).toEqual(mid);
	});
});
