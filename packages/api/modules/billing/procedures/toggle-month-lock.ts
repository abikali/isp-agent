import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

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

		const updated = await db.billingMonth.update({
			where: { id: input.billingMonthId },
			data: { locked: input.locked },
		});

		// When locking, auto-create the next month (unlocked) so it becomes the new active month
		let nextMonth = null;
		if (input.locked) {
			const nextYear = month.month === 12 ? month.year + 1 : month.year;
			const nextMonthNum = month.month === 12 ? 1 : month.month + 1;

			nextMonth = await db.billingMonth.upsert({
				where: {
					organizationId_year_month: {
						organizationId: input.organizationId,
						year: nextYear,
						month: nextMonthNum,
					},
				},
				update: {},
				create: {
					organizationId: input.organizationId,
					year: nextYear,
					month: nextMonthNum,
					locked: false,
				},
			});
		}

		return { month: updated, nextMonth };
	});
