import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { previousPeriod, resolvePeriod } from "../../finance/lib/period";
import { netOwed, round2 } from "../lib/ledger";
import {
	dealerWhereForScope,
	resolveDealerScope,
	scopedDealerSelect,
} from "../lib/scope";

/** Billing-log rows that are the dealer SPENDING credit (not admin transfers). */
const ADMIN_TRANSFER_TYPES = ["CREDIT", "DEBIT"];

/**
 * The owner's dealer page in one call: what every dealer owes, how much
 * prepaid credit each has left, what they burned this month, and when they
 * last paid — plus the totals across all of them.
 *
 * "Owes" is recomputed from the ledger rows (Σcredit − Σdebit). The stored
 * `balance` column is never read; see `lib/ledger.ts` for why.
 */
export const getDealerFinanceOverview = protectedProcedure
	.route({
		method: "GET",
		path: "/dealers/finance/overview",
		tags: ["Dealers"],
		summary: "What each dealer owes, their prepaid credit, and totals",
	})
	.input(z.object({ organizationId: z.string() }))
	.handler(async ({ context: { user }, input }) => {
		const scope = await resolveDealerScope(
			input.organizationId,
			user.id,
			"read",
		);

		const thisMonth = resolvePeriod("this-month");
		const lastMonth = previousPeriod(thisMonth);

		const dealers = await db.ispDealer.findMany({
			where: dealerWhereForScope(scope),
			select: scopedDealerSelect,
			orderBy: { name: "asc" },
		});
		const dealerIds = dealers.map((d) => d.id);
		const inScope = { dealerId: { in: dealerIds } };

		const [
			ledgerTotals,
			lastPayments,
			lastTopUps,
			chargedNow,
			chargedPrior,
			syncOp,
			staff,
		] = await Promise.all([
			db.ispDealerAccount.groupBy({
				by: ["dealerId"],
				where: inScope,
				_sum: { credit: true, debit: true },
				_max: { operationDate: true },
			}),
			db.ispDealerAccount.groupBy({
				by: ["dealerId"],
				where: { ...inScope, debit: { gt: 0 } },
				_max: { operationDate: true },
			}),
			db.ispDealerAccount.groupBy({
				by: ["dealerId"],
				where: { ...inScope, credit: { gt: 0 } },
				_max: { operationDate: true },
			}),
			db.dealerCharge.groupBy({
				by: ["dealerId"],
				where: {
					organizationId: scope.organizationId,
					...inScope,
					type: { notIn: ADMIN_TRANSFER_TYPES },
					operationDate: { gte: thisMonth.from, lt: thisMonth.to },
				},
				_sum: { debit: true },
			}),
			db.dealerCharge.groupBy({
				by: ["dealerId"],
				where: {
					organizationId: scope.organizationId,
					...inScope,
					type: { notIn: ADMIN_TRANSFER_TYPES },
					operationDate: { gte: lastMonth.from, lt: lastMonth.to },
				},
				_sum: { debit: true },
			}),
			db.iRadiusSyncOperation.findFirst({
				where: { organizationId: null },
				orderBy: { createdAt: "desc" },
				select: {
					id: true,
					status: true,
					completedAt: true,
					createdAt: true,
				},
			}),
			// Who can take cash from a dealer on the operator's behalf.
			scope.canManage
				? db.employee.findMany({
						where: {
							organizationId: scope.organizationId,
							status: "ACTIVE",
							deletedAt: null,
							...(scope.activeDealerId
								? { dealerId: scope.activeDealerId }
								: {}),
						},
						select: { id: true, name: true, department: true },
						orderBy: { name: "asc" },
					})
				: Promise.resolve([]),
		]);

		const byDealer = <T extends { dealerId: string }>(rows: T[]) =>
			new Map(rows.map((r) => [r.dealerId, r]));
		const totalsMap = byDealer(ledgerTotals);
		const lastPaymentMap = byDealer(lastPayments);
		const lastTopUpMap = byDealer(lastTopUps);
		const chargedNowMap = byDealer(chargedNow);
		const chargedPriorMap = byDealer(chargedPrior);

		const rows = dealers.map((dealer) => {
			const totals = totalsMap.get(dealer.id);
			const owed = netOwed(
				totals?._sum.credit ?? 0,
				totals?._sum.debit ?? 0,
			);
			const prepaid = round2(dealer.credit ?? 0);
			const chargedThisMonth = round2(
				chargedNowMap.get(dealer.id)?._sum.debit ?? 0,
			);
			const chargedLastMonth = round2(
				chargedPriorMap.get(dealer.id)?._sum.debit ?? 0,
			);

			// "About to run out": below the threshold the dealer asked iRadius
			// to warn at, or below a quarter of what they burned last month —
			// whichever is higher. A dealer that spends nothing is never low.
			const warnAt = Math.max(
				dealer.notificationAmount ?? 0,
				chargedLastMonth * 0.25,
			);
			const lowCredit = warnAt > 0 && prepaid < warnAt;

			return {
				id: dealer.id,
				name: dealer.name,
				username: dealer.username,
				companyName: dealer.companyName,
				parentName: dealer.parentDealer?.name ?? null,
				isSubDealer: dealer.parentDealerId !== null,
				status: dealer.status,
				isDeleted: dealer.deletedAt !== null,
				isLinked: dealer.externalId !== null,
				customersCount: dealer._count.customers,
				prepaid,
				owed,
				chargedThisMonth,
				chargedLastMonth,
				lowCredit,
				warnAt: round2(warnAt),
				lastPaymentAt:
					lastPaymentMap.get(dealer.id)?._max.operationDate ?? null,
				lastTopUpAt:
					lastTopUpMap.get(dealer.id)?._max.operationDate ?? null,
				lastActivityAt: totals?._max.operationDate ?? null,
			};
		});

		// Dealers deleted upstream but still carrying a balance are shown
		// apart: the money is real, the counterparty is gone.
		const live = rows.filter((r) => !r.isDeleted);
		const orphans = rows.filter((r) => r.isDeleted && r.owed !== 0);

		const totals = {
			dealerCount: live.length,
			owed: round2(live.reduce((sum, r) => sum + r.owed, 0)),
			prepaid: round2(live.reduce((sum, r) => sum + r.prepaid, 0)),
			chargedThisMonth: round2(
				live.reduce((sum, r) => sum + r.chargedThisMonth, 0),
			),
			owingCount: live.filter((r) => r.owed > 0).length,
			lowCreditCount: live.filter((r) => r.lowCredit).length,
			orphanOwed: round2(orphans.reduce((sum, r) => sum + r.owed, 0)),
		};

		const lastSyncedAt = dealers.reduce<Date | null>((latest, d) => {
			if (!d.lastSyncedAt) {
				return latest;
			}
			return !latest || d.lastSyncedAt > latest ? d.lastSyncedAt : latest;
		}, null);

		return {
			isOperator: scope.isOperator,
			canManage: scope.canManage,
			periodLabel: thisMonth.label,
			lastSyncedAt,
			sync: syncOp
				? {
						operationId: syncOp.id,
						status: syncOp.status,
						running:
							syncOp.status === "pending" ||
							syncOp.status === "in_progress",
					}
				: null,
			totals,
			dealers: live,
			orphans,
			staff,
		};
	});
