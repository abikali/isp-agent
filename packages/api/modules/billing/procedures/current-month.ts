import { requirePermission } from "@repo/api/lib/permission";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";
import { resolveActiveBillingMonth } from "../lib/resolve-month";

export const getCurrentMonth = protectedProcedure
	.route({
		method: "GET",
		path: "/billing/months/current",
		tags: ["Billing"],
		summary: "Get the active billing month (latest unlocked)",
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

		const month = await resolveActiveBillingMonth(input.organizationId);

		return { month };
	});
