import {
	getDealerScopeFilter,
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { cachedStat, statCacheKey } from "@repo/api/lib/stat-cache";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

interface DatedAmount {
	day: string;
	amount: number;
}

interface DatedCount {
	day: string;
	count: number;
}

function emptyDailySeries(days: number): { day: string }[] {
	const now = new Date();
	now.setUTCHours(0, 0, 0, 0);
	const out: { day: string }[] = [];
	for (let i = days - 1; i >= 0; i--) {
		const d = new Date(now);
		d.setUTCDate(d.getUTCDate() - i);
		out.push({ day: d.toISOString().slice(0, 10) });
	}
	return out;
}

export const getDashboardTrends = protectedProcedure
	.route({
		method: "GET",
		path: "/dashboard/trends",
		tags: ["Dashboard"],
		summary:
			"Revenue per day, new customers per day, and aging buckets for the org",
	})
	.input(
		z.object({
			organizationId: z.string(),
			windowDays: z.number().int().min(7).max(180).default(30),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		return cachedStat(
			statCacheKey("dashboard/trends", [
				input.organizationId,
				activeDealerId,
				input.windowDays,
			]),
			async () => {
				const now = new Date();
				const since = new Date(now);
				since.setUTCDate(since.getUTCDate() - input.windowDays + 1);
				since.setUTCHours(0, 0, 0, 0);

				const customerDealerFilter =
					getDealerScopeFilter(activeDealerId);
				const paymentDealerFilter =
					getDealerScopeViaCustomer(activeDealerId);

				const [payments, newCustomers, customers] = await Promise.all([
					db.payment.findMany({
						where: {
							organizationId: input.organizationId,
							status: "COLLECTED",
							paidAt: { gte: since },
							...paymentDealerFilter,
						},
						select: { paidAt: true, paidAmount: true },
					}),
					db.customer.findMany({
						where: {
							organizationId: input.organizationId,
							createdAt: { gte: since },
							deletedAt: null,
							...customerDealerFilter,
						},
						select: { createdAt: true },
					}),
					db.customer.findMany({
						where: {
							organizationId: input.organizationId,
							deletedAt: null,
							expiresAt: { not: null, lt: now },
							...customerDealerFilter,
						},
						select: { expiresAt: true, monthlyRate: true },
					}),
				]);

				const revenueByDay = new Map<string, number>();
				for (const p of payments) {
					const day = p.paidAt.toISOString().slice(0, 10);
					revenueByDay.set(
						day,
						(revenueByDay.get(day) ?? 0) + p.paidAmount,
					);
				}
				const customersByDay = new Map<string, number>();
				for (const c of newCustomers) {
					const day = c.createdAt.toISOString().slice(0, 10);
					customersByDay.set(day, (customersByDay.get(day) ?? 0) + 1);
				}

				const skeleton = emptyDailySeries(input.windowDays);
				const revenuePoints: DatedAmount[] = skeleton.map((d) => ({
					day: d.day,
					amount: revenueByDay.get(d.day) ?? 0,
				}));
				const customersPoints: (DatedCount & { cumulative: number })[] =
					[];
				let cumulative = 0;
				for (const d of skeleton) {
					const count = customersByDay.get(d.day) ?? 0;
					cumulative += count;
					customersPoints.push({ day: d.day, count, cumulative });
				}

				const buckets = [
					{ label: "0-30", min: 0, max: 30 },
					{ label: "31-60", min: 31, max: 60 },
					{ label: "61-90", min: 61, max: 90 },
					{ label: "90+", min: 91, max: Number.POSITIVE_INFINITY },
				];

				const aging = buckets.map((b) => ({
					label: b.label,
					count: 0,
					amount: 0,
				}));

				for (const c of customers) {
					if (!c.expiresAt) {
						continue;
					}
					const daysOverdue = Math.floor(
						(now.getTime() - c.expiresAt.getTime()) /
							(1000 * 60 * 60 * 24),
					);
					const bucketIdx = buckets.findIndex(
						(b) => daysOverdue >= b.min && daysOverdue <= b.max,
					);
					if (bucketIdx >= 0 && aging[bucketIdx]) {
						aging[bucketIdx].count += 1;
						aging[bucketIdx].amount += c.monthlyRate ?? 0;
					}
				}

				return {
					revenuePoints,
					customersPoints,
					aging,
				};
			},
		);
	});
