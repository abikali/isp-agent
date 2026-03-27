import { ORPCError } from "@orpc/server";
import { verifyOrganizationMembership } from "@repo/api/lib/membership";
import { db } from "@repo/database";
import z from "zod";
import { protectedProcedure } from "../../../orpc/procedures";

export const closeCycle = protectedProcedure
	.route({
		method: "POST",
		path: "/billing/cycles/close",
		tags: ["Billing"],
		summary: "Close a billing cycle",
	})
	.input(
		z.object({
			organizationId: z.string(),
			cycleId: z.string(),
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
				message: "Billing cycle is already closed",
			});
		}

		const updated = await db.billingCycle.update({
			where: { id: input.cycleId },
			data: {
				status: "CLOSED",
				closedAt: new Date(),
			},
		});

		return { cycle: updated };
	});
