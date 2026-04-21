import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { openBillingMonth } from "../lib/open-month";

export const toggleMonthLock = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/months/toggle-lock",
		tags: ["Billing"],
		summary: "Lock a billing month and advance to the next one",
	})
	.input(
		z.object({
			organizationId: z.string(),
			billingMonthId: z.string(),
			locked: z.boolean(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"manage",
		);

		const month = await db.billingMonth.findFirst({
			where: {
				id: input.billingMonthId,
				organizationId: input.organizationId,
			},
		});

		if (!month) {
			throw new ORPCError("NOT_FOUND", {
				message: "Billing month not found",
			});
		}

		if (!input.locked) {
			const updated = await db.billingMonth.update({
				where: { id: input.billingMonthId },
				data: { locked: false },
			});
			return { month: updated, nextMonth: null };
		}

		// When locking, atomically: lock the month, snapshot expiresAt →
		// billingExpiresAt for all org customers, and open the next month
		// (which also generates invoices for it). This freezes the billing
		// expiry so mid-cycle iRadius mass-renewals don't interfere with
		// collection.
		const nextYear = month.month === 12 ? month.year + 1 : month.year;
		const nextMonthNum = month.month === 12 ? 1 : month.month + 1;

		const { updated, nextMonth } = await db.$transaction(async (tx) => {
			const updated = await tx.billingMonth.update({
				where: { id: input.billingMonthId },
				data: { locked: true },
			});
			await tx.$executeRaw`
				UPDATE "customer"
				SET "billingExpiresAt" = "expiresAt"
				WHERE "organizationId" = ${input.organizationId}
				  AND "expiresAt" IS NOT NULL
			`;
			const nextMonth = await openBillingMonth(
				tx,
				input.organizationId,
				nextYear,
				nextMonthNum,
			);
			return { updated, nextMonth };
		});

		return { month: updated, nextMonth };
	});
