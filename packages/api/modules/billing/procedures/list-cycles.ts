import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
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
		const member = await verifyOrganizationMembership(
			input.organizationId,
			user.id,
		);
		if (!member) {
			throw new ORPCError("FORBIDDEN", {
				message: "You must be a member of this organization",
			});
		}

		const cycles = await db.billingCycle.findMany({
			where: { organizationId: input.organizationId },
			orderBy: [{ year: "desc" }, { month: "desc" }],
		});

		return { cycles };
	});
