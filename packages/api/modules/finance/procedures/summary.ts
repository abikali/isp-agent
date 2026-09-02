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
 * The four numbers an owner actually asks for, plus the comparison that makes
 * them mean something.
 *
 * "Money in" is CASH BASIS: what collectors physically handed to the office in
 * the period. A payment a collector records is not money the owner has yet —
 * it sits in the collector's pocket until a handoff — so "you kept" is built
 * from handoffs minus spending, and the recorded payments are reported
 * separately as "collected", the field-side view of the same cash.
 *
 * This replaces `billing.reports.grandTotal`, which computed
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
		summary: "Money in, money out, what you're owed, what staff hold",
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
					priorHandedIn,
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
					fetchHandedIn(scope, prior),
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

				// Cash basis: what reached the office, minus what was spent.
				const kept = handedIn.total - current.cost;
				const priorKept = priorHandedIn.total - previous.cost;

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
						moneyIn: priorHandedIn.total,
						collected: previous.revenue,
						moneyOut: previous.cost,
						operatingProfit: priorKept,
						net: priorKept - previous.draws,
					},
					/** Cash that physically reached the office in the period:
					 *  collectors' HANDOFF rows by handoff date. This is the
					 *  "money in" of the headline equation. */
					moneyIn: {
						total: handedIn.total,
						handoffs: handedIn.count,
					},
					/** Everything the team RECORDED taking from customers and
					 *  dealers: subscriptions, one-off setup/hardware cash, and
					 *  dealer charges. Counted when entered, whether or not the
					 *  cash has been handed in yet, so it does not subtract from
					 *  moneyIn and must not be added to it. */
					collected: {
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
					moneyOut: {
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
					owed: receivables,
					held: cashHeld,
				};
			},
		);
	});
