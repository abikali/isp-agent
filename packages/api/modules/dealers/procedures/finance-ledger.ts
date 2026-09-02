import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { shortMonthLabel } from "../../finance/lib/period";
import {
	classifyLedgerRow,
	displayNote,
	isLegacyCurrency,
	type LedgerKind,
	netOwed,
	round2,
	withRunningBalance,
} from "../lib/ledger";
import { requireDealerInScope, resolveDealerScope } from "../lib/scope";

const ADMIN_TRANSFER_TYPES = ["CREDIT", "DEBIT"];
const ACTIVITY_MONTHS = 6;

function monthStart(date: Date, offsetMonths: number): Date {
	return new Date(
		Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offsetMonths, 1),
	);
}

/**
 * One dealer's full money story: the receivable ledger as a timeline with a
 * recomputed running balance, the headline figures, and what the dealer has
 * been consuming (renewals etc.) over the last six months.
 *
 * The whole ledger is loaded (the largest dealer has ~320 rows) because the
 * running balance needs every row anyway; filtering happens after.
 */
export const getDealerFinanceLedger = protectedProcedure
	.route({
		method: "GET",
		path: "/dealers/finance/{dealerId}/ledger",
		tags: ["Dealers"],
		summary: "A dealer's receivable ledger, running balance and activity",
	})
	.input(
		z.object({
			organizationId: z.string(),
			dealerId: z.string(),
			from: z.coerce.date().optional(),
			to: z.coerce.date().optional(),
			kinds: z
				.array(
					z.enum([
						"top_up",
						"deduction",
						"payment",
						"write_off",
						"in_kind",
						"adjustment",
					]),
				)
				.optional(),
			limit: z.number().int().min(10).max(1000).default(500),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const scope = await resolveDealerScope(
			input.organizationId,
			user.id,
			"read",
		);
		const dealer = await requireDealerInScope(scope, input.dealerId);

		const now = new Date();
		const activityFrom = monthStart(now, -(ACTIVITY_MONTHS - 1));
		const twelveMonthsAgo = monthStart(now, -11);

		const [ledgerRows, charges] = await Promise.all([
			db.ispDealerAccount.findMany({
				where: { dealerId: dealer.id },
				orderBy: [{ operationDate: "asc" }, { createdAt: "asc" }],
				select: {
					id: true,
					externalId: true,
					credit: true,
					debit: true,
					comment: true,
					operationDate: true,
				},
			}),
			db.dealerCharge.findMany({
				where: {
					organizationId: scope.organizationId,
					dealerId: dealer.id,
					operationDate: { gte: activityFrom },
				},
				orderBy: { operationDate: "desc" },
				select: {
					id: true,
					type: true,
					debit: true,
					credit: true,
					description: true,
					operationDate: true,
				},
			}),
		]);

		// Same-second rows (a top-up and its immediate payment) must keep
		// iRadius's insert order or the running balance dips below zero for
		// one row. `externalId` is the iRadius auto-increment id.
		ledgerRows.sort(
			(a, b) =>
				a.operationDate.getTime() - b.operationDate.getTime() ||
				Number(a.externalId ?? 0) - Number(b.externalId ?? 0),
		);
		const running = withRunningBalance(ledgerRows);
		const sumCredit = ledgerRows.reduce((s, r) => s + r.credit, 0);
		const sumDebit = ledgerRows.reduce((s, r) => s + r.debit, 0);
		const owed = netOwed(sumCredit, sumDebit);

		const last12 = { topUps: 0, payments: 0, writeOffs: 0, deductions: 0 };
		const entries = running
			.map(({ row, balanceAfter }) => {
				const kind = classifyLedgerRow(row);
				const amount = row.credit > 0 ? row.credit : row.debit;
				const legacyCurrency = isLegacyCurrency(amount);
				if (!legacyCurrency && row.operationDate >= twelveMonthsAgo) {
					if (kind === "top_up") {
						last12.topUps += row.credit;
					} else if (kind === "deduction") {
						last12.deductions += row.debit;
					} else if (kind === "write_off") {
						last12.writeOffs += row.debit;
					} else {
						last12.payments += row.debit;
					}
				}
				return {
					id: row.id,
					externalId: row.externalId,
					kind,
					amount: round2(amount),
					/** +: what they owe went up (credit extended); −: went down. */
					direction: (row.credit > 0 ? "up" : "down") as
						| "up"
						| "down",
					note: displayNote(row.comment),
					rawComment: row.comment,
					operationDate: row.operationDate,
					balanceAfter,
					legacyCurrency,
				};
			})
			.filter((entry) => {
				if (input.from && entry.operationDate < input.from) {
					return false;
				}
				if (input.to && entry.operationDate > input.to) {
					return false;
				}
				if (input.kinds && !input.kinds.includes(entry.kind)) {
					return false;
				}
				return true;
			})
			.reverse()
			.slice(0, input.limit);

		// Activity: consumption by month, newest last, always six buckets so
		// the chart has a stable shape even for a quiet dealer.
		const months = Array.from({ length: ACTIVITY_MONTHS }, (_, i) => {
			const start = monthStart(now, i - (ACTIVITY_MONTHS - 1));
			return {
				year: start.getUTCFullYear(),
				month: start.getUTCMonth() + 1,
				label: shortMonthLabel(
					start.getUTCFullYear(),
					start.getUTCMonth() + 1,
				),
				charged: 0,
				refunded: 0,
				count: 0,
			};
		});
		const bucketIndex = new Map(
			months.map((m, i) => [`${m.year}-${m.month}`, i]),
		);
		for (const charge of charges) {
			if (ADMIN_TRANSFER_TYPES.includes(charge.type)) {
				continue;
			}
			const key = `${charge.operationDate.getUTCFullYear()}-${charge.operationDate.getUTCMonth() + 1}`;
			const index = bucketIndex.get(key);
			const bucket = index === undefined ? undefined : months[index];
			if (!bucket) {
				continue;
			}
			bucket.charged = round2(bucket.charged + charge.debit);
			bucket.refunded = round2(bucket.refunded + charge.credit);
			bucket.count += 1;
		}

		const recentCharges = charges
			.filter((c) => !ADMIN_TRANSFER_TYPES.includes(c.type))
			.slice(0, 25)
			.map((c) => ({
				id: c.id,
				type: c.type,
				amount: round2(c.debit > 0 ? c.debit : -c.credit),
				description: c.description,
				operationDate: c.operationDate,
			}));

		return {
			dealer: {
				id: dealer.id,
				name: dealer.name,
				username: dealer.username,
				companyName: dealer.companyName,
				parentName: dealer.parentDealer?.name ?? null,
				status: dealer.status,
				isDeleted: dealer.deletedAt !== null,
				isLinked: dealer.externalId !== null,
				customersCount: dealer._count.customers,
				lastSyncedAt: dealer.lastSyncedAt,
			},
			canManage: scope.canManage,
			summary: {
				owed,
				prepaid: round2(dealer.credit ?? 0),
				entryCount: ledgerRows.length,
				firstEntryAt: ledgerRows[0]?.operationDate ?? null,
				lastEntryAt:
					ledgerRows[ledgerRows.length - 1]?.operationDate ?? null,
				last12: {
					topUps: round2(last12.topUps),
					payments: round2(last12.payments),
					writeOffs: round2(last12.writeOffs),
					deductions: round2(last12.deductions),
				},
			},
			entries,
			activity: { months, recentCharges },
		};
	});

export type DealerLedgerKind = LedgerKind;
