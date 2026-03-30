import { ORPCError } from "@orpc/server";
import {
	getDealerScopeFilter,
	requirePermission,
} from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { sumOrZero } from "../lib/calculations";

export const createCollection = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/collections",
		tags: ["Billing"],
		summary: "Record a cash handoff from a collector",
	})
	.input(
		z.object({
			organizationId: z.string(),
			collectorId: z.string(),
			amount: z.number().finite().positive(),
			notes: z.string().max(500).optional(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		// Verify collector exists (and belongs to active dealer if scoped)
		const collector = await db.employee.findFirst({
			where: {
				id: input.collectorId,
				organizationId: input.organizationId,
				...getDealerScopeFilter(activeDealerId),
			},
			select: { id: true },
		});
		if (!collector) {
			throw new ORPCError("NOT_FOUND", {
				message: "Collector not found",
			});
		}

		// Atomic: validate pending balance + create handoff in one transaction
		const collection = await db.$transaction(async (tx) => {
			const pendingAgg = await tx.payment.aggregate({
				where: {
					organizationId: input.organizationId,
					collectorId: input.collectorId,
					status: "PENDING",
				},
				_sum: { paidAmount: true },
			});

			const availableBalance = Math.max(0, sumOrZero(pendingAgg));

			if (input.amount > availableBalance + 0.01) {
				throw new ORPCError("BAD_REQUEST", {
					message: `Handoff amount ($${input.amount.toFixed(2)}) exceeds the collector's pending balance ($${availableBalance.toFixed(2)})`,
				});
			}

			return tx.cashCollection.create({
				data: {
					organizationId: input.organizationId,
					collectorId: input.collectorId,
					amount: input.amount,
					notes: input.notes ?? null,
					type: "HANDOFF",
					receivedById: user.id,
				},
				include: {
					collector: { select: { id: true, name: true } },
				},
			});
		});

		return { collection };
	});
