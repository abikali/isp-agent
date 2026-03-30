import { ORPCError } from "@orpc/server";
import { NO_DEALER, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { rebuildPaidCurrentCycle } from "../lib/rebuild-paid-status";

export const reopenCycle = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/cycles/reopen",
		tags: ["Billing"],
		summary:
			"Reopen a closed billing cycle and restore paid status from payments",
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

		if (cycle.status === "OPEN") {
			throw new ORPCError("BAD_REQUEST", {
				message: "Billing cycle is already open",
			});
		}

		const dealerFilter = activeDealerId ?? NO_DEALER;
		const result = await db.$transaction(async (tx) => {
			// Reopen the cycle
			const updated = await tx.billingCycle.update({
				where: { id: input.cycleId },
				data: {
					status: "OPEN",
					closedAt: null,
				},
			});

			// Rebuild paidCurrentCycle from all non-stopped payments
			const { restored } = await rebuildPaidCurrentCycle(
				tx,
				input.organizationId,
				input.cycleId,
				dealerFilter,
			);

			return { cycle: updated, customersRestored: restored };
		});

		logger.info(
			`[Billing] Reopened cycle ${cycle.year}/${cycle.month}, restored ${result.customersRestored} customers`,
		);

		return {
			cycle: result.cycle,
			customersRestored: result.customersRestored,
		};
	});
