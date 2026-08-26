import { requirePermission } from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { foldLines } from "../lib/money-model";
import { periodProgress, previousPeriod, resolvePeriod } from "../lib/period";
import {
	type FinanceScope,
	fetchCashHeld,
	fetchCostLines,
	fetchReceivables,
	fetchRetailRevenue,
	fetchWholesaleRevenue,
} from "../lib/queries";

const periodSchema = z.enum(["this-month", "last-month", "last-3", "last-12"]);

/**
 * The four numbers an owner actually asks for, plus the comparison that makes
 * them mean something.
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
			statCacheKey("finance/summary", [
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
					priorRetail,
					priorWholesale,
					priorCostLines,
				] = await Promise.all([
					fetchRetailRevenue(scope, period),
					fetchWholesaleRevenue(scope, period),
					fetchCostLines(scope, period),
					fetchReceivables(scope),
					fetchCashHeld(scope),
					fetchRetailRevenue(scope, prior),
					fetchWholesaleRevenue(scope, prior),
					fetchCostLines(scope, prior),
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
					...priorCostLines,
				]);

				const unclassified = costLines
					.filter((l) => !l.categoryId)
					.reduce((sum, l) => sum + l.amount, 0);

				return {
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
						moneyIn: previous.revenue,
						moneyOut: previous.cost,
						net: previous.net,
						operatingProfit: previous.operatingProfit,
					},
					moneyIn: {
						total: current.revenue,
						retail: current.byStream.RETAIL,
						wholesale: current.byStream.WHOLESALE,
						other: current.byStream.OTHER,
						wholesaleSettled: wholesale.settled,
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
					operatingProfit: current.operatingProfit,
					net: current.net,
					owed: receivables,
					held: cashHeld,
				};
			},
		);
	});
