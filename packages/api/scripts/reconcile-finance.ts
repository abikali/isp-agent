// biome-ignore-all lint/suspicious/noConsole: CLI reconciliation script; stdout is the intended output.
/**
 * Reconciliation harness for the finance module.
 *
 * Runs the real query layer against whatever database DATABASE_URL points at
 * and prints the figures, so they can be checked against hand-written SQL
 * before anyone trusts the numbers on /insights.
 *
 * This exists because the module replaced a reporting surface that was wrong by
 * ~$56,000 a month for four months without anyone being able to prove it. The
 * fix is only worth as much as the check.
 *
 * Usage:
 *   cd packages/api
 *   export $(grep -E '^DATABASE_URL=' ../../.env.local | sed 's/"//g')
 *   pnpm dlx tsx scripts/reconcile-finance.ts
 *
 * Expected for Liban-Com production (verified read-only 2026-08-26):
 *
 *   month   retail   wholesale   costs      net
 *   2026-05  56,305     47,755   82,708  +21,352
 *   2026-06  59,925     54,506   90,506  +23,925
 *   2026-07  58,903     54,699   91,497  +22,105
 *   2026-08  58,189     50,386   80,425  +28,150   (partial, to the 26th)
 *
 * A local snapshot will show zero wholesale until the dealer-charge sync has
 * run, and zero costs for months its expense data does not reach.
 */

import { foldLines } from "../modules/finance/lib/money-model";
import {
	fetchCashHeld,
	fetchCostLines,
	fetchReceivables,
	fetchRetailRevenue,
	fetchWholesaleRevenue,
} from "../modules/finance/lib/queries";

const ORG = "tfd8fq3ns41kx41w0stnmnc1";
const DEALER = "cmndqek5u0000wt1knwcr73jq";

function monthPeriod(year: number, month: number) {
	return {
		from: new Date(Date.UTC(year, month - 1, 1)),
		to: new Date(Date.UTC(year, month, 1)),
		label: `${year}-${String(month).padStart(2, "0")}`,
		months: [{ year, month }],
	};
}

async function main() {
	const scope = { organizationId: ORG, activeDealerId: DEALER };

	console.log("month     retail   wholesale   costs      net");
	const months: Array<readonly [number, number]> = [
		[2026, 5],
		[2026, 6],
		[2026, 7],
		[2026, 8],
	];

	for (const [y, m] of months) {
		const period = monthPeriod(y, m);
		const [retail, wholesale, costs] = await Promise.all([
			fetchRetailRevenue(scope, period),
			fetchWholesaleRevenue(scope, period),
			fetchCostLines(scope, period),
		]);

		const folded = foldLines([
			{
				kind: "REVENUE",
				label: "Subscribers",
				amount: retail,
				stream: "RETAIL",
			},
			{
				kind: "REVENUE",
				label: "Dealers",
				amount: wholesale.charged,
				stream: "WHOLESALE",
			},
			...costs,
		]);

		console.log(
			`${period.label}  ${String(Math.round(retail)).padStart(7)} ${String(Math.round(wholesale.charged)).padStart(9)} ${String(Math.round(folded.cost)).padStart(9)} ${String(Math.round(folded.net)).padStart(8)}`,
		);
	}

	const owed = await fetchReceivables(scope);
	console.log(
		`\nOwed: $${Math.round(owed.total)} across ${owed.count} invoices`,
	);
	if (owed.byMonth[0]) {
		console.log(
			`Oldest unpaid: ${owed.byMonth[0].year}-${owed.byMonth[0].month}`,
		);
	}

	const held = await fetchCashHeld(scope);
	console.log(
		`\nHeld by staff: $${Math.round(held.total)} across ${held.holders.length} people`,
	);
	for (const h of held.holders.slice(0, 5)) {
		console.log(`  ${h.name.padEnd(22)} ${Math.round(h.amount)}`);
	}

	const latestCosts = await fetchCostLines(scope, monthPeriod(2026, 7));
	const byLabel = new Map<string, number>();
	for (const c of latestCosts) {
		byLabel.set(c.label, (byLabel.get(c.label) ?? 0) + c.amount);
	}
	console.log("\nJuly cost buckets:");
	for (const [label, amount] of byLabel) {
		console.log(`  ${label.padEnd(22)} ${Math.round(amount)}`);
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error(e);
		process.exit(1);
	});
