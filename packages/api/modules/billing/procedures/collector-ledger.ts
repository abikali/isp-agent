import {
	getDealerScopeViaCustomer,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { paginationSchema } from "../lib/schemas";

export const getCollectorLedger = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/collectors/ledger",
		tags: ["Billing"],
		summary:
			"Get chronological transaction ledger for a collector (collections + handoffs)",
	})
	.input(
		z
			.object({
				organizationId: z.string(),
				collectorId: z.string(),
			})
			.merge(paginationSchema(50)),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const dealerViaCustomer = getDealerScopeViaCustomer(activeDealerId);

		const [payments, handoffs] = await Promise.all([
			db.payment.findMany({
				where: {
					organizationId: input.organizationId,
					collectorId: input.collectorId,
					status: "COLLECTED",
					...dealerViaCustomer,
				},
				select: {
					id: true,
					paidAmount: true,
					paidAt: true,
					stoppedAccount: true,
					customer: {
						select: {
							firstName: true,
							lastName: true,
							username: true,
						},
					},
				},
				orderBy: { paidAt: "desc" },
			}),
			db.cashCollection.findMany({
				where: {
					organizationId: input.organizationId,
					collectorId: input.collectorId,
				},
				select: {
					id: true,
					amount: true,
					collectedAt: true,
					notes: true,
					receivedBy: {
						select: { name: true },
					},
				},
				orderBy: { collectedAt: "desc" },
			}),
		]);

		// Merge into a single chronological ledger
		type LedgerEntry = {
			id: string;
			type: "collection" | "handoff" | "stopped";
			amount: number;
			date: Date;
			description: string;
		};

		const ledger: LedgerEntry[] = [
			...payments.map((p) => ({
				id: p.id,
				type: p.stoppedAccount
					? ("stopped" as const)
					: ("collection" as const),
				amount: p.paidAmount,
				date: p.paidAt,
				description: `${p.customer.firstName} ${p.customer.lastName}`,
			})),
			...handoffs.map((h) => ({
				id: h.id,
				type: "handoff" as const,
				amount: -h.amount,
				date: h.collectedAt,
				description: h.notes
					? `Handoff — ${h.notes}`
					: `Handoff${h.receivedBy ? ` to ${h.receivedBy.name}` : ""}`,
			})),
		];

		// Sort by date descending
		ledger.sort((a, b) => b.date.getTime() - a.date.getTime());

		// Paginate
		const total = ledger.length;
		const start = (input.page - 1) * input.pageSize;
		const paged = ledger.slice(start, start + input.pageSize);

		return {
			entries: paged,
			total,
			page: input.page,
			pageSize: input.pageSize,
			totalPages: Math.ceil(total / input.pageSize),
		};
	});
