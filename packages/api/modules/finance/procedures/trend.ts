import { requirePermission } from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { foldLines } from "../lib/money-model";
import { resolvePeriod, shortMonthLabel } from "../lib/period";
import {
	type FinanceScope,
	fetchCostLines,
	fetchRetailRevenue,
	fetchWholesaleRevenue,
} from "../lib/queries";

/**
 * Month-by-month history, so "is this normal?" has an answer on the page
 * instead of in someone's head.
 */
export const getFinanceTrend = protectedProcedure
	.route({
		method: "GET",
		path: "/finance/trend",
		tags: ["Finance"],
		summary: "Monthly money in / out / kept",
	})
	.input(
		z.object({
			organizationId: z.string(),
			months: z.number().int().min(3).max(24).default(12),
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
			statCacheKey("finance/trend", [
				input.organizationId,
				activeDealerId,
				input.months,
			]),
			async () => {
				const window = resolvePeriod("last-12");
				const months = window.months.slice(-input.months);

				const points = await Promise.all(
					months.map(async (m) => {
						const single = {
							from: new Date(Date.UTC(m.year, m.month - 1, 1)),
							to: new Date(Date.UTC(m.year, m.month, 1)),
							label: shortMonthLabel(m.year, m.month),
							months: [m],
						};

						const [retail, wholesale, costs] = await Promise.all([
							fetchRetailRevenue(scope, single),
							fetchWholesaleRevenue(scope, single),
							fetchCostLines(scope, single),
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

						return {
							year: m.year,
							month: m.month,
							label: single.label,
							retail: folded.byStream.RETAIL,
							wholesale: folded.byStream.WHOLESALE,
							moneyIn: folded.revenue,
							moneyOut: folded.cost,
							draws: folded.draws,
							net: folded.net,
						};
					}),
				);

				return { points };
			},
			120_000,
		);
	});
