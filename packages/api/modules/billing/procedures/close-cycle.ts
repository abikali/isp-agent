import { ORPCError } from "@orpc/server";
import { NO_DEALER, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const closeCycle = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/cycles/close",
		tags: ["Billing"],
		summary: "Close a billing cycle and reset customers for next month",
	})
	.input(
		z.object({
			organizationId: z.string(),
			cycleId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const cycle = await db.billingCycle.findUnique({
			where: { id: input.cycleId },
		});

		if (!cycle || cycle.organizationId !== input.organizationId) {
			throw new ORPCError("NOT_FOUND", {
				message: "Billing cycle not found",
			});
		}

		if (cycle.status === "CLOSED") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Billing cycle is already closed",
			});
		}

		const result = await db.$transaction(async (tx) => {
			const updated = await tx.billingCycle.update({
				where: { id: input.cycleId },
				data: {
					status: "CLOSED",
					closedAt: new Date(),
				},
			});

			const resetResult = await tx.customer.updateMany({
				where: {
					organizationId: input.organizationId,
					paidCurrentCycle: true,
					dealerId: activeDealerId ?? NO_DEALER,
				},
				data: { paidCurrentCycle: false },
			});

			return { cycle: updated, customersReset: resetResult.count };
		});

		logger.info(
			`[Billing] Closed cycle ${cycle.year}/${cycle.month}, reset ${result.customersReset} customers`,
		);

		return {
			cycle: result.cycle,
			customersReset: result.customersReset,
		};
	});
