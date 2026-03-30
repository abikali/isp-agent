import { ORPCError } from "@orpc/server";
import { NO_DEALER, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const resetCycle = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/cycles/reset",
		tags: ["Billing"],
		summary:
			"Reset a billing cycle — marks all customers as unpaid without closing the cycle",
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
				message: "Cannot reset a closed cycle. Reopen it first.",
			});
		}

		// Reset dealer's customers' paidCurrentCycle to false
		const resetResult = await db.customer.updateMany({
			where: {
				organizationId: input.organizationId,
				paidCurrentCycle: true,
				dealerId: activeDealerId ?? NO_DEALER,
			},
			data: { paidCurrentCycle: false },
		});

		logger.info(
			`[Billing] Reset cycle ${cycle.year}/${cycle.month}, reset ${resetResult.count} customers to unpaid`,
		);

		return {
			cycle,
			customersReset: resetResult.count,
		};
	});
