import { requirePermission } from "@repo/api/lib/permission";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { resolveOrCreateBillingCycle } from "../lib/resolve-cycle";

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
		const { activeBillingYear, activeBillingMonth } =
			await requirePermission(
				input.organizationId,
				user.id,
				"billing",
				"view",
			);

		const cycle = await resolveOrCreateBillingCycle(
			input.organizationId,
			activeBillingYear,
			activeBillingMonth,
		);

		return { cycle };
	});
