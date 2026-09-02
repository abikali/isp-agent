import { requirePermission } from "@repo/api/lib/permission";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { previousPeriod, resolvePeriod } from "../lib/period";
import {
	type FinanceScope,
	fetchCostLines,
	fetchFieldCash,
	fetchRetailRevenue,
	fetchWholesaleRevenue,
} from "../lib/queries";

const periodSchema = z.enum(["this-month", "last-month", "last-3", "last-12"]);

/**
 * The detail behind the headline: where revenue came from and where cost went,
 * each against the same period last time.
 *
 * Rule this must never break: the advanced view may add detail, but it must
 * never contradict the simple view. Both read the same functions in
 * `lib/queries.ts`, so they cannot drift.
 */
export const getFinanceBreakdown = protectedProcedure
	.route({
		method: "GET",
		path: "/finance/breakdown",
		tags: ["Finance"],
		summary: "Revenue by stream and cost by category, with deltas",
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

		const period = resolvePeriod(input.period);
		const prior = previousPeriod(period);

		const [
			retail,
			wholesale,
			fieldCash,
			costLines,
			priorRetail,
			priorWholesale,
			priorFieldCash,
			priorCostLines,
		] = await Promise.all([
			fetchRetailRevenue(scope, period),
			fetchWholesaleRevenue(scope, period),
			fetchFieldCash(scope, period),
			fetchCostLines(scope, period),
			fetchRetailRevenue(scope, prior),
			fetchWholesaleRevenue(scope, prior),
			fetchFieldCash(scope, prior),
			fetchCostLines(scope, prior),
		]);

		/** Sum cost lines by their label, keeping draws separate from costs. */
		function groupCosts(lines: typeof costLines) {
			const map = new Map<
				string,
				{ label: string; amount: number; kind: string; count: number }
			>();
			for (const line of lines) {
				const entry = map.get(line.label) ?? {
					label: line.label,
					amount: 0,
					kind: line.kind,
					count: 0,
				};
				entry.amount += line.amount;
				entry.count += 1;
				map.set(line.label, entry);
			}
			return map;
		}

		const currentCosts = groupCosts(costLines);
		const priorCosts = groupCosts(priorCostLines);

		const costBreakdown = [...currentCosts.values()]
			.map((entry) => {
				const before = priorCosts.get(entry.label)?.amount ?? 0;
				return {
					...entry,
					previous: before,
					delta: entry.amount - before,
				};
			})
			.sort((a, b) => b.amount - a.amount);

		// Lines that stopped entirely still matter — a vanished $13k commitment
		// is news, and omitting it makes the totals look unexplained.
		for (const [label, entry] of priorCosts) {
			if (!currentCosts.has(label)) {
				costBreakdown.push({
					label,
					amount: 0,
					kind: entry.kind,
					count: 0,
					previous: entry.amount,
					delta: -entry.amount,
				});
			}
		}

		return {
			period: { key: input.period, label: period.label },
			comparison: { label: prior.label },
			revenue: [
				{
					key: "retail",
					label: "Monthly subscriptions",
					amount: retail,
					previous: priorRetail,
					delta: retail - priorRetail,
				},
				{
					key: "field",
					label: "Setup fees & hardware",
					amount: fieldCash,
					previous: priorFieldCash,
					delta: fieldCash - priorFieldCash,
				},
				{
					key: "wholesale",
					label: "Dealers reselling your service",
					amount: wholesale.charged,
					previous: priorWholesale.charged,
					delta: wholesale.charged - priorWholesale.charged,
				},
			],
			costs: costBreakdown.filter(
				(c) => c.kind !== "DRAW" && (c.amount > 0 || c.previous > 0),
			),
			draws: costBreakdown.filter(
				(c) => c.kind === "DRAW" && (c.amount > 0 || c.previous > 0),
			),
		};
	});
