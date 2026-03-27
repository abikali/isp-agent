import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const getCurrentCycle = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/cycles/current",
		tags: ["Billing"],
		summary: "Get or create the current billing cycle",
	})
	.input(
		z.object({
			organizationId: z.string(),
		}),
	)
	.handler(async ({ context: { user }, input }) => {
		await requirePermission(
			input.organizationId,
			user.id,
			"billing",
			"view",
		);

		const now = new Date();
		const year = now.getFullYear();
		const month = now.getMonth() + 1;

		const cycle = await db.billingCycle.upsert({
			where: {
				organizationId_year_month: {
					organizationId: input.organizationId,
					year,
					month,
				},
			},
			update: {},
			create: {
				organizationId: input.organizationId,
				year,
				month,
				status: "OPEN",
			},
		});

		return { cycle };
	});
