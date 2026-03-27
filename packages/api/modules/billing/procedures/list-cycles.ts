import { requirePermission } from "@repo/api/lib/permission";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const listCycles = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/cycles",
		tags: ["Billing"],
		summary: "List billing cycles",
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

		const cycles = await db.billingCycle.findMany({
			where: { organizationId: input.organizationId },
			orderBy: [{ year: "desc" }, { month: "desc" }],
		});

		return { cycles };
	});
