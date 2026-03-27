import { ORPCError } from "@orpc/server";
import { requirePermission } from "@repo/api/lib/permission";
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
		await requirePermission(
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
