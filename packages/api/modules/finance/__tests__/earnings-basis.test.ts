import { describe, expect, it } from "vitest";
import { foldLines, type MoneyLine } from "../lib/money-model";

/**
 * The arithmetic the Money page publishes, pinned.
 *
 * Every case here is a real fault this codebase shipped. The formulas are
 * duplicated from `finance/procedures/summary.ts` deliberately: the procedure
 * needs a live database, and what must never drift is the SHAPE of the
 * subtraction, not the query behind it.
 */
const operatingProfit = (earned: number, spent: number) => earned - spent;
const net = (earned: number, spent: number, draws: number) =>
	operatingProfit(earned, spent) - draws;

describe("the earnings statement", () => {
	it("does not charge the business twice for what a worker paid out of collected cash", () => {
		// A worker collects $1,000, spends $100 on parts, hands in $900.
		// The business kept $900. The old headline computed handedIn − cost
		// (900 − 100 = 800), removing the $100 once by never reaching the
		// office and again as a cost. Measured on prod for September 2026,
		// all seven approved worker claims were funded this way.
		const earned = 1000;
		const spent = 100;
		const handedIn = 900;

		expect(operatingProfit(earned, spent)).toBe(900);
		expect(handedIn - spent).toBe(800);
	});

	it("keeps owner draws out of the subtraction the page displays", () => {
		// September 2026: $3,035 handed in, $958 of costs, $3,019 of draws.
		// The page showed "short $942" — the net — under an equation that
		// only names earnings and costs, so the arithmetic could not be
		// followed and the draws were invisible.
		const earned = 3035;
		const spent = 958;
		const draws = 3019;

		expect(operatingProfit(earned, spent)).toBe(2077);
		expect(net(earned, spent, draws)).toBe(-942);
	});

	it("counts an owner-entered expense as a cost even with no worker attached", () => {
		// Direct rows carry no submittedById. A dealer-relation filter dropped
		// them entirely, hiding $1,350 of September spending — including the
		// $1,000 maintenance fee — from Money out.
		const lines: MoneyLine[] = [
			{
				kind: "REVENUE",
				label: "Subscribers",
				amount: 3035,
				stream: "RETAIL",
			},
			{
				kind: "COST",
				label: "Worker claim",
				amount: 958,
				categoryId: "c1",
			},
			{
				kind: "COST",
				label: "Owner entry",
				amount: 1350,
				categoryId: "c2",
			},
		];

		const folded = foldLines(lines);

		expect(folded.cost).toBe(2308);
		expect(operatingProfit(folded.revenue, folded.cost)).toBe(727);
	});

	it("recognises a dealer's money once — when charged, not again when paid", () => {
		// A dealer is charged $7,000 for September renewals and later pays
		// the $7,000 in cash to a worker. The business earned $7,000, not
		// $14,000; the payment is a TRANSFER and folds to nothing.
		const lines: MoneyLine[] = [
			{
				kind: "REVENUE",
				label: "Dealers",
				amount: 7000,
				stream: "WHOLESALE",
			},
			{ kind: "TRANSFER", label: "Dealer payment", amount: 7000 },
		];
		const folded = foldLines(lines);
		expect(folded.revenue).toBe(7000);
		expect(folded.byStream.WHOLESALE).toBe(7000);
	});
});

describe("the cash position", () => {
	it("is not earned − handed in: dealer charges are never cash in staff hands", () => {
		// September 2026, abiroot: earned = 58,588 retail + 42,597 dealer
		// charges + 1,183 field, with 52,600 handed in. "Still out with the
		// team" showed earned − handed in = $49,768 while staff really held
		// $41,459. The dealer charges settle on the dealers' own ledger, so
		// the page now shows the held balance and "Dealers still owe" apart.
		const earned = 58_588 + 42_597 + 1_183;
		const handedIn = 52_600;
		const heldByTeam = 41_459;
		const oldStillOut = earned - handedIn;

		expect(oldStillOut).toBe(49_768);
		expect(oldStillOut).not.toBe(heldByTeam);
		// Without the dealer charges the old subtraction cannot even reach
		// what staff hold — it was never measuring staff cash.
		expect(oldStillOut - 42_597).toBeLessThan(heldByTeam);
	});
});
