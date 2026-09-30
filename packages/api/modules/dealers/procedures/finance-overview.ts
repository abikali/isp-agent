import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import {
	collectorRoleWhere,
	resolveCashRole,
	workerRoleWhere,
} from "../../employees/lib/cash-role";
import { DEALER_ADMIN_TRANSFER_TYPES } from "../../finance/lib/money-model";
import { previousPeriod, resolvePeriod } from "../../finance/lib/period";
import { netOwed, round2 } from "../lib/ledger";
import { resolveDealerWhatsApp } from "../lib/notify-dealer";
import {
	dealerWhereForScope,
	resolveDealerScope,
	scopedDealerSelect,
} from "../lib/scope";

const ADMIN_TRANSFER_TYPES: string[] = [...DEALER_ADMIN_TRANSFER_TYPES];

/**
 * Warn when an own line's prepaid credit covers fewer than this many charges
 * of its dearest plan. iRadius refuses a NEW USER / renewal charge the dealer
 * can't cover, and setup approval only logs that failure — so a line that runs
 * dry quietly produces approved-but-unbilled subscribers.
 */
const OWN_LINE_WARN_CHARGES = 5;

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
			// Who can take cash from a dealer on the operator's behalf: field
			// staff only (collector or worker role), labelled with that role.
			scope.canManage
				? db.employee
						.findMany({
							where: {
								organizationId: scope.organizationId,
								status: "ACTIVE",
								deletedAt: null,
								...(scope.activeDealerId
									? { dealerId: scope.activeDealerId }
									: {}),
								OR: [
									collectorRoleWhere({}),
									workerRoleWhere(scope.organizationId),
								],
							},
							select: {
								id: true,
								name: true,
								department: true,
								cashRole: true,
							},
							orderBy: { name: "asc" },
						})
						.then((rows) =>
							rows.map((e) => ({
								id: e.id,
								name: e.name,
								cashRole: resolveCashRole(e),
							})),
						)
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
			const whatsapp = resolveDealerWhatsApp(dealer);

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
				/** Customer payment reminders granted by the operator; null = the dealer has no LibanCom org. */
				reminders: dealer.activeForOrganization
					? {
							organizationName: dealer.activeForOrganization.name,
							allowed:
								dealer.activeForOrganization
									.expiryReminderAllowed,
						}
					: null,
				/** Where money confirmations go (E.164); null = they cannot be sent. */
				whatsappPhone:
					whatsapp.status === "ok" ? `+${whatsapp.phone}` : null,
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

		const ownLines = scope.isOperator
			? await loadOwnLinesCredit(scope.organizationId, scope.ownDealerIds)
			: [];

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
			ownLines,
			staff,
		};
	});

/**
 * The operator's own dealer accounts — the master and its internal lines
 * (LIBANCOM-FIBER). They are kept off the dealer list, but they still spend
 * prepaid iRadius credit on every new subscriber and renewal, so their credit
 * is shown on its own.
 */
async function loadOwnLinesCredit(
	organizationId: string,
	ownDealerIds: string[],
) {
	if (ownDealerIds.length === 0) {
		return [];
	}
	const dealers = await db.ispDealer.findMany({
		where: { id: { in: ownDealerIds }, deletedAt: null },
		select: {
			id: true,
			name: true,
			externalId: true,
			credit: true,
			notificationAmount: true,
			noCharge: true,
			internalLineOfOrganizationId: true,
			lastSyncedAt: true,
		},
		orderBy: { name: "asc" },
	});
	const externalIds = dealers.flatMap((d) =>
		d.externalId ? [d.externalId] : [],
	);
	// Plans keep naming the iRadius dealer that owns them — and that it
	// charges — in `dealerExternalId`, whichever local dealer they sit under.
	const dearestPlans = await db.servicePlan.groupBy({
		by: ["dealerExternalId"],
		where: {
			organizationId,
			deletedAt: null,
			dealerExternalId: { in: externalIds },
		},
		_max: { rate: true },
	});
	const maxRate = new Map(
		dearestPlans.map((p) => [p.dealerExternalId, p._max.rate ?? 0]),
	);

	return dealers.map((dealer) => {
		const prepaid = round2(dealer.credit ?? 0);
		const rate = dealer.externalId
			? (maxRate.get(dealer.externalId) ?? 0)
			: 0;
		const warnAt = dealer.noCharge
			? 0
			: Math.max(
					dealer.notificationAmount ?? 0,
					rate * OWN_LINE_WARN_CHARGES,
				);
		return {
			id: dealer.id,
			name: dealer.name,
			isInternalLine: dealer.internalLineOfOrganizationId !== null,
			prepaid,
			noCharge: dealer.noCharge,
			chargesLeft:
				rate > 0 ? Math.max(0, Math.floor(prepaid / rate)) : null,
			lowCredit: warnAt > 0 && prepaid < warnAt,
			warnAt: round2(warnAt),
			lastSyncedAt: dealer.lastSyncedAt,
		};
	});
}
