import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { EXPENSE_STATS_CACHE } from "../lib/stats-cache";

export const getExpenseStats = protectedProcedure
	.route({
		method: "GET",
		path: "/expenses/stats",
		tags: ["Expenses"],
		summary: "Expense dashboard statistics",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"expenses",
			"read",
		);

		const dealerScope = getDealerScopeFilter(activeDealerId);

		// Renders as a sidebar badge on every page in the app, so it re-fires on
		// every navigation alongside five other badge queries. Cache the result
		// the same way the other shell aggregations do.
		return cachedStat(
			statCacheKey(EXPENSE_STATS_CACHE, [
				input.organizationId,
				activeDealerId,
			]),
			async () => {
				const [pending, approved] = await Promise.all([
					db.expense.aggregate({
						where: {
							organizationId: input.organizationId,
							status: "PENDING",
							submittedBy: dealerScope,
						},
						_count: true,
						_sum: { amount: true },
					}),
					db.expense.aggregate({
						where: {
							organizationId: input.organizationId,
							status: "APPROVED",
							submittedBy: dealerScope,
						},
						_count: true,
						_sum: { amount: true },
					}),
				]);

				return {
					pendingCount: pending._count,
					pendingAmount: pending._sum.amount ?? 0,
					approvedCount: approved._count,
					approvedAmount: approved._sum.amount ?? 0,
				};
			},
		);
	});
