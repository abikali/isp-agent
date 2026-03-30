import { NO_DEALER, requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import { logger } from "@repo/logs";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { rebuildPaidCurrentCycle } from "../lib/rebuild-paid-status";

export const setActiveCycle = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/cycles/set-active",
		tags: ["Billing"],
		summary:
			"Set the active billing period and reconstruct paid status from payments",
	})
	.input(
		z.object({
			organizationId: z.string(),
			year: z.number().int().min(2020).max(2100),
			month: z.number().int().min(1).max(12),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		const { activeDealerId } = await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		// Upsert the cycle for the target month
		const cycle = await db.billingCycle.upsert({
			where: {
				organizationId_year_month: {
					organizationId: input.organizationId,
					year: input.year,
					month: input.month,
				},
			},
			update: {},
			create: {
				organizationId: input.organizationId,
				year: input.year,
				month: input.month,
				status: "OPEN",
			},
		});

		// Reconstruct paidCurrentCycle from payments in this cycle (scoped to dealer)
		const dealerFilter = activeDealerId ?? NO_DEALER;
		const paidCount = await db.$transaction(async (tx) => {
			// Update the org's active billing period
			await tx.organization.update({
				where: { id: input.organizationId },
				data: {
					activeBillingYear: input.year,
					activeBillingMonth: input.month,
				},
			});

			// Rebuild paidCurrentCycle from all non-stopped payments
			const { restored } = await rebuildPaidCurrentCycle(
				tx,
				input.organizationId,
				cycle.id,
				dealerFilter,
			);

			return restored;
		});

		logger.info(
			`[Billing] Set active period to ${input.year}/${input.month}, restored ${paidCount} paid customers`,
		);

		return { cycle };
	});
