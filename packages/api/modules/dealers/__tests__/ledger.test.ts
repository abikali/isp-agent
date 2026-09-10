import { describe, expect, it } from "vitest";
import {
	buildLedgerComment,
	classifyLedgerRow,
	displayNote,
	isLegacyCurrency,
	netOwed,
	withRunningBalance,
} from "../lib/ledger";

describe("classifyLedgerRow", () => {
	it("treats any credit as a top-up regardless of comment", () => {
		expect(
			classifyLedgerRow({
				credit: 6400,
				debit: 0,
				comment: "Month 8 Band",
			}),
		).toBe("top_up");
	});

	it("reads the legacy 'free' convention as a write-off", () => {
		expect(
			classifyLedgerRow({ credit: 0, debit: 450, comment: "free" }),
		).toBe("write_off");
		expect(
			classifyLedgerRow({ credit: 0, debit: 450, comment: "FREE " }),
		).toBe("write_off");
	});

	it("reads the owner's 'bonus' convention as goodwill, never cash", () => {
		// 8 rows in Aug–Sep 2026 typed straight into iRadius as Bonus/BONUS.
		// They lower what the dealer owes; no money arrived.
		expect(
			classifyLedgerRow({ credit: 0, debit: 150, comment: "Bonus" }),
		).toBe("bonus");
		expect(
			classifyLedgerRow({ credit: 0, debit: 200, comment: "BONUS " }),
		).toBe("bonus");
		const comment = buildLedgerComment("bonus", "loyal since 2021");
		expect(comment).toBe("Bonus: loyal since 2021");
		expect(classifyLedgerRow({ credit: 0, debit: 50, comment })).toBe(
			"bonus",
		);
		expect(displayNote(comment)).toBe("loyal since 2021");
	});

	it("keeps a cash payment taken by an employee as a payment", () => {
		expect(
			classifyLedgerRow({
				credit: 0,
				debit: 7000,
				comment: "Received by walewe",
			}),
		).toBe("payment");
	});

	it("classifies app-written prefixes and round-trips the note", () => {
		const comment = buildLedgerComment("in_kind", "router ftth");
		expect(comment).toBe("In kind: router ftth");
		expect(classifyLedgerRow({ credit: 0, debit: 75, comment })).toBe(
			"in_kind",
		);
		expect(displayNote(comment)).toBe("router ftth");
	});

	it("keeps plain payments unprefixed, like the owner always did", () => {
		expect(buildLedgerComment("payment", "  ")).toBeNull();
		expect(buildLedgerComment("payment", "cash at office")).toBe(
			"cash at office",
		);
		expect(
			classifyLedgerRow({
				credit: 0,
				debit: 100,
				comment: "cash at office",
			}),
		).toBe("payment");
	});

	it("prefix without a note still classifies", () => {
		const comment = buildLedgerComment("write_off", null);
		expect(comment).toBe("Write-off:");
		expect(classifyLedgerRow({ credit: 0, debit: 1, comment })).toBe(
			"write_off",
		);
		expect(displayNote(comment)).toBeNull();
	});
});

describe("running balance", () => {
	it("recomputes rather than trusting a stored balance", () => {
		// kafranet, 2026-08-25: two debits back-dated to :00 after the
		// credit, so iRadius's stored balance read 350 while the truth is 50.
		const rows = withRunningBalance([
			{ credit: 0, debit: 300, comment: null },
			{ credit: 0, debit: 300, comment: null },
			{ credit: 350, debit: 0, comment: null },
		]);
		expect(rows.map((r) => r.balanceAfter)).toEqual([-300, -600, -250]);
		expect(netOwed(350, 300)).toBe(50);
	});

	it("rounds to cents", () => {
		expect(netOwed(0.1 + 0.2, 0)).toBe(0.3);
	});
});

describe("isLegacyCurrency", () => {
	it("flags the 2023 LBP-era rows", () => {
		expect(isLegacyCurrency(57_267_850)).toBe(true);
		expect(isLegacyCurrency(17_000)).toBe(false);
	});
});
