import { requirePermission } from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { FINANCE_STAT_CACHE } from "../lib/cache";
import { foldLines } from "../lib/money-model";
import { periodProgress, previousPeriod, resolvePeriod } from "../lib/period";
import {
	type FinanceScope,
	fetchCashHeld,
	fetchCostLines,
	fetchFieldCash,
	fetchHandedIn,
	fetchReceivables,
	fetchRetailRevenue,
	fetchWholesaleRevenue,
} from "../lib/queries";

const periodSchema = z.enum(["this-month", "last-month", "last-3", "last-12"]);

/**
 * Two separate statements, never mixed into one subtraction.
 *
 *   EARNINGS — did the business make money?
 *     earned (subscriptions + setup/hardware + dealers) − spent = operating
 *     profit; minus owner draws = net.
 *
 *   CASH — where is that money right now?
 *     reached the office · still in the team's hands · still owed by
 *     customers.
 *
 * ## Why they must not be mixed
 *
 * `money-model.ts` classifies HANDOFF as a TRANSFER: "cash changing hands
 * between people inside the company … NEVER counts toward profit — it only
 * moves a balance." The headline used to compute `handedIn − cost` anyway,
 * putting a transfer on the income side of a profit statement. That
 * double-charged every worker-funded expense: a worker who collects $1,000,
 * spends $100 on parts and hands in $900 produced `900 − 100 = 800`, when the
 * business had in fact kept $900. The $100 was removed once by never reaching
 * the office and again as a cost. Measured on prod for September 2026, all
 * seven approved worker claims ($3,977) were funded this way, so every one of
 * them was counted twice.
 *
 * Earnings therefore run on what the team RECORDED taking in, which already
 * includes the cash a worker spent before handing the rest over. Handoffs
 * describe cash position only, and appear under `cash`.
 *
 * This also replaces `billing.reports.grandTotal`, which computed
 * `totalHandedOff − totalExpenses` where `totalHandedOff` already contained the
 * expenses. They cancelled, so expenses moved the headline by exactly zero and
 * what survived was a collector cash snapshot displayed as profit — reporting
 * −$34,199 for a month that netted +$22,105.
 */
export const getFinanceSummary = protectedProcedure
	.route({
		method: "GET",
		path: "/finance/summary",
		tags: ["Finance"],
		summary: "What you earned and spent, and where the cash is",
	})
	.input(
		z.object({
			organizationId: z.string(),
			period: periodSchema.default("this-month"),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const scope: FinanceScope = {
			organizationId: input.organizationId,
			activeDealerId: activeDealerId ?? null,
		};

		return cachedStat(
			statCacheKey(FINANCE_STAT_CACHE.summary, [
				input.organizationId,
				activeDealerId,
				input.period,
			]),
			async () => {
				const period = resolvePeriod(input.period);
				const prior = previousPeriod(period);

				const [
					retail,
					wholesale,
					costLines,
					receivables,
					cashHeld,
					handedIn,
					fieldCash,
					priorRetail,
					priorWholesale,
					priorCostLines,
					priorFieldCash,
				] = await Promise.all([
					fetchRetailRevenue(scope, period),
					fetchWholesaleRevenue(scope, period),
					fetchCostLines(scope, period),
					fetchReceivables(scope),
					fetchCashHeld(scope),
					fetchHandedIn(scope, period),
					fetchFieldCash(scope, period),
					fetchRetailRevenue(scope, prior),
					fetchWholesaleRevenue(scope, prior),
					fetchCostLines(scope, prior),
					fetchFieldCash(scope, prior),
				]);

				const current = foldLines([
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
					{
						kind: "REVENUE",
						label: "Setup & hardware",
						amount: fieldCash,
						stream: "FIELD",
					},
					...costLines,
				]);

				const previous = foldLines([
					{
						kind: "REVENUE",
						label: "Subscribers",
						amount: priorRetail,
						stream: "RETAIL",
					},
					{
						kind: "REVENUE",
						label: "Dealers",
						amount: priorWholesale.charged,
						stream: "WHOLESALE",
					},
					{
						kind: "REVENUE",
						label: "Setup & hardware",
						amount: priorFieldCash,
						stream: "FIELD",
					},
					...priorCostLines,
				]);

				const unclassified = costLines
					.filter((l) => !l.categoryId)
					.reduce((sum, l) => sum + l.amount, 0);

				// Earnings basis: what the business took in, minus what it
				// spent. NOT handoffs — see the note at the top of this file.
				const kept = current.revenue - current.cost;
				const priorKept = previous.revenue - previous.cost;

				return {
					/** When these numbers were computed. They are served from
					 *  a short cache, so the page shows this and offers a
					 *  refresh instead of pretending to be live. */
					computedAt: new Date().toISOString(),
					period: {
						key: input.period,
						label: period.label,
						from: period.from.toISOString(),
						to: period.to.toISOString(),
						/** 0–1. The UI must use this to avoid comparing a
						 *  part-month against a whole one. */
						progress: periodProgress(period),
						isPartial: periodProgress(period) < 0.999,
					},
					comparison: {
						label: prior.label,
						earned: previous.revenue,
						spent: previous.cost,
						operatingProfit: priorKept,
						net: priorKept - previous.draws,
					},
					/** Everything the business took in during the period:
					 *  subscriptions, one-off setup/hardware cash, and dealer
					 *  charges. Counted when the team recorded it, which is the
					 *  moment the customer paid — whether or not that cash has
					 *  since reached the office. This is the income side of the
					 *  earnings statement. */
					earned: {
						total: current.revenue,
						retail: current.byStream.RETAIL,
						field: current.byStream.FIELD,
						wholesale: current.byStream.WHOLESALE,
						other: current.byStream.OTHER,
						wholesaleSettled: wholesale.settled,
					},
					/** Things that would make the headline misleading if the
					 *  page stated it confidently. The UI must degrade to an
					 *  honest "we can't tell yet" rather than publishing a
					 *  number it knows is incomplete. */
					gaps: {
						/** iRadius has never populated dealer charges, so
						 *  wholesale income — historically about half of all
						 *  revenue — is invisible. */
						wholesaleNeverSynced: wholesale.neverSynced,
					},
					/** Every approved cost in the period, whoever's pocket it
					 *  came out of. A worker who paid from collected cash is a
					 *  cost exactly once: the money he spent is already inside
					 *  `earned`. */
					spent: {
						total: current.cost,
						/** Spend nobody has classified yet. When this is a
						 *  meaningful share of the total, the headline deserves
						 *  a warning rather than confident precision. */
						unclassified,
						unclassifiedShare:
							current.cost > 0 ? unclassified / current.cost : 0,
					},
					draws: current.draws,
					operatingProfit: kept,
					net: kept - current.draws,
					/** Cash POSITION — never an input to the arithmetic above.
					 *  `reachedOffice` is this period's handoffs; the other two
					 *  are balances as of now. */
					cash: {
						reachedOffice: handedIn.total,
						handoffs: handedIn.count,
						inTeamHands: cashHeld,
						owedByCustomers: receivables,
					},
				};
			},
		);
	});
